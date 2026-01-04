import { MongoClient } from "mongodb";
import { google } from "googleapis";
import { refreshTokenIfNeeded } from "@/lib/authUtils";

export interface Subscription {
    id: string;
    channelId: string;
    title: string;
    thumbnails: {
        default: { url: string };
        medium: { url: string };
        high: { url: string };
    };
    enabled: boolean;
}

const mongoUri = process.env.MONGODB_URI;
const dbName = process.env.MONGODB_DB;

if (!mongoUri || !dbName) {
    throw new Error(
        "Missing MongoDB connection string, database name, or Google OAuth credentials"
    );
}

// GET /api/subscriptions
// Returns all subscriptions from the database
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
            // Fetch subscriptions page
            const subsResponse = await youtube.subscriptions.list({
                part: ["snippet", "contentDetails"],
                mine: true,
                maxResults: 50,
                pageToken: nextPageToken,
            });

            if (subsResponse.data.items) {
                const newItems = subsResponse.data.items.map((item) => ({
                    id: item.id as string,
                    channelId: item.snippet!.resourceId!.channelId as string,
                    title: item.snippet!.title,
                    thumbnails: item.snippet!.thumbnails,
                })) as Subscription[];

                subscriptions.push(...newItems);
            }

            // Prepare for next page
            nextPageToken = subsResponse.data.nextPageToken ?? undefined;
        } while (nextPageToken);

        // Prepare MongoDB update objects
        const updates = subscriptions.map((sub) => ({
            updateOne: {
                filter: { id: sub.id },
                update: { $set: sub },
                upsert: true,
            },
        }));

        // Apply bulk updates
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
