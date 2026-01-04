import { MongoClient } from "mongodb";
import { google } from "googleapis";
import { Subscription } from "../subscriptions/route";
import { refreshTokenIfNeeded, createOAuth2Client } from "@/lib/authUtils";

export interface Video {
    title: string;
    channelTitle: string;
    publishedAt: string;
    id: string;
    videoId: string;
    thumbnail: {
        default: { url: string };
        medium: { url: string };
        high: { url: string };
        standard?: { url: string };
        maxres?: { url: string };
    };
    duration: number;
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

        // Refresh token if needed
        const authenticatedOAuth2Client = await refreshTokenIfNeeded();

        const docs = await db
            .collection("subscriptions")
            .find({
                enabled: true,
            })
            .toArray();

        const youtube = google.youtube({
            version: "v3",
            auth: authenticatedOAuth2Client,
        });

        const videos: Video[] = [];
        const feedUpdates: {
            updateOne: {
                filter: { id: string };
                update: { $set: Video };
                upsert: boolean;
            };
        }[] = [];

        for (const subscription of docs) {
            const channelId = subscription.channelId;
            const channelTitle = subscription.title;

            try {
                const channelResponse = await youtube.channels.list({
                    // @ts-expect-error -- IGNORE --
                    part: "contentDetails",
                    id: channelId,
                });

                // @ts-expect-error -- IGNORE --
                if (channelResponse.data.items?.[0]) {
                    const uploadsPlaylistId =
                        // @ts-expect-error -- IGNORE --
                        channelResponse.data.items[0].contentDetails
                            .relatedPlaylists?.uploads;

                    if (!uploadsPlaylistId) {
                        console.warn(
                            `No uploads playlist found for channel: ${channelId}`
                        );
                        continue;
                    }

                    // Get videos from the uploads playlist, filtering out shorts
                    const videosResponse = await youtube.search.list({
                        // @ts-expect-error -- IGNORE --
                        part: "snippet",
                        channelId: channelId,
                        type: "video",
                        maxResults: 5,
                        order: "date",
                    });

                    // @ts-expect-error -- IGNORE --
                    console.log(videosResponse.data.items);

                    // @ts-expect-error -- IGNORE --
                    if (videosResponse.data.items) {
                        // Get video IDs

                        // @ts-expect-error -- IGNORE --
                        const videoIds = videosResponse.data.items.map(
                            // @ts-expect-error -- IGNORE --
                            (item) => item.id.videoId
                        );

                        // Fetch video details to get duration
                        const videoDetailsResponse = await youtube.videos.list({
                            // @ts-expect-error -- IGNORE --
                            part: "contentDetails",
                            id: videoIds.join(","),
                        });

                        // Create a map of video IDs to durations
                        const durationMap: { [key: string]: number } = {};

                        // @ts-expect-error -- IGNORE --
                        videoDetailsResponse.data.items?.forEach((item) => {
                            const match = item.contentDetails.duration.match(
                                /PT(\d+H)?(\d+M)?(\d+S)?/
                            );

                            const hours = parseInt(match?.[1]) || 0;
                            const minutes = parseInt(match?.[2]) || 0;
                            const seconds = parseInt(match?.[3]) || 0;
                            const totalSeconds =
                                hours * 3600 + minutes * 60 + seconds;
                            durationMap[item.id] = totalSeconds;

                            console.log(
                                "1231231231321",
                                match,
                                totalSeconds,
                                item
                            );
                        });

                        // @ts-expect-error -- IGNORE --
                        videosResponse.data.items.forEach((item) => {
                            const videoDuration =
                                durationMap[item.id.videoId] || 0;

                            const video: Video = {
                                id: item.id.videoId,

                                title: item.snippet.title,
                                description: item.snippet.description,

                                // @ts-expect-error -- IGNORE --
                                publishedAt: Math.floor(
                                    new Date(
                                        item.snippet.publishedAt
                                    ).getTime() / 1000
                                ),

                                channelId: item.snippet.channelId,
                                channelTitle: channelTitle,

                                thumbnail: item.snippet.thumbnails,
                                duration: videoDuration,
                            };
                            videos.push(video);

                            feedUpdates.push({
                                updateOne: {
                                    filter: { id: video.id },
                                    update: { $set: video },
                                    upsert: true,
                                },
                            });
                        });
                    }
                }
            } catch (error) {
                console.error(
                    `Error fetching videos for channel ${channelId}:`,
                    error
                );
                continue;
            }
        }

        // Save videos to database
        if (feedUpdates.length > 0) {
            await db.collection("feed").bulkWrite(feedUpdates);
        }

        return Response.json({
            items: videos,
            totalResults: videos.length,
        });
    } catch (error) {
        console.error("Error getting feed:", error);
        return Response.json(
            { message: "Failed to fetch feed!" },
            { status: 500 }
        );
    } finally {
        await client.close();
    }
}
