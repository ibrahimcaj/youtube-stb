import { MongoClient } from "mongodb";
import { google } from "googleapis";
import { refreshTokenIfNeeded, createOAuth2Client } from "@/lib/authUtils";

interface Thumbnail {
    url: string;
}

interface ResourceId {
    kind: string;
    channelId: string;
}

interface Snippet {
    publishedAt: string;
    title: string;
    description: string;
    resourceId: ResourceId;
    channelId: string;
    thumbnails: {
        default: Thumbnail;
        medium: Thumbnail;
        high: Thumbnail;
    };
}

interface ContentDetails {
    totalItemCount: number;
    newItemCount: number;
    activityType: string;
}

export interface Subscription {
    id: string;
    channelId: string;
    title: string;
    thumbnails: {
        default: Thumbnail;
        medium: Thumbnail;
        high: Thumbnail;
    };
    enabled: boolean;
}

const mongoUri = process.env.MONGODB_URI;
const dbName = process.env.MONGODB_DB;

const googleClientID = process.env.GOOGLE_CLIENT_ID;
const googleClientSecret = process.env.GOOGLE_CLIENT_SECRET;

if (!mongoUri || !dbName || !googleClientID || !googleClientSecret) {
    throw new Error(
        "Missing MongoDB connection string, database name, or Google OAuth credentials"
    );
}

// configure the OAuth2 client
const oauth2Client = createOAuth2Client();

export async function GET() {
    const client = new MongoClient(mongoUri!);

    try {
        await client.connect();
        const db = client.db(dbName);
        const subscriptions = await db
            .collection("subscriptions")
            .find({})
            .toArray();

        return Response.json({
            items: subscriptions,
            totalResults: subscriptions.length,
        });
    } catch (error) {
        console.error("Error fetching subscriptions:", error);
        return Response.json(
            { message: "Failed to fetch subscriptions!" },
            { status: 500 }
        );
    } finally {
        await client.close();
    }
}

export async function POST() {
    const client = new MongoClient(mongoUri!);

    try {
        await client.connect();
        const db = client.db(dbName);

        // Refresh token if needed
        const authenticatedOAuth2Client = await refreshTokenIfNeeded();

        const youtube = google.youtube({
            version: "v3",
            auth: authenticatedOAuth2Client,
        });

        const subscriptions: Subscription[] = [];
        let nextPageToken: string | undefined;

        do {
            const subsResponse = await youtube.subscriptions.list({
                // @ts-expect-error -- IGNORE --
                part: "snippet,contentDetails",
                mine: true,
                maxResults: 50,
                pageToken: nextPageToken,
            });

            // @ts-expect-error -- IGNORE --
            if (subsResponse.data.items) {
                // @ts-expect-error -- IGNORE --
                const newItems = subsResponse.data.items.map(
                    (item: { id: string; snippet: Snippet }) => ({
                        id: item.id,
                        channelId: item.snippet.resourceId.channelId,
                        title: item.snippet.title,
                        thumbnails: item.snippet.thumbnails,
                    })
                ) as Subscription[];
                subscriptions.push(...newItems);
            }

            // @ts-expect-error -- IGNORE --
            nextPageToken = subsResponse.data.nextPageToken;
        } while (nextPageToken);

        const updates = subscriptions.map((sub) => ({
            updateOne: {
                filter: { id: sub.id },
                update: { $set: sub },
                upsert: true,
            },
        }));

        await db.collection("subscriptions").bulkWrite(updates);

        return Response.json({
            items: subscriptions,
            totalResults: subscriptions.length,
        });
    } catch (error) {
        console.error("Error getting token:", error);
        return Response.json(
            { message: "Authentication failed!" },
            { status: 500 }
        );
    } finally {
        await client.close();
    }
}
