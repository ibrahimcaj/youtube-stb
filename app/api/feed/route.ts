import { MongoClient } from "mongodb";
import { google } from "googleapis";
import { refreshTokenIfNeeded } from "@/lib/authUtils";

type ChannelListRequest = {
    part: string[];
    id: string[];
};

type SearchListRequest = {
    part: string[];
    channelId: string;
    type: string[];
    maxResults?: number;
    order?: string;
};

type VideoListRequest = {
    part: string[];
    id: string[];
};

type ChannelListResponse = {
    data: {
        items?: Array<{
            contentDetails?: {
                relatedPlaylists?: {
                    uploads?: string;
                };
            };
        }>;
    };
};

type SearchListResponse = {
    data: {
        items: Array<{
            id: { videoId: string };
            snippet: {
                title: string;
                description?: string;
                publishedAt: string;
                channelId: string;
                thumbnails: Record<string, { url: string }>;
            };
        }>;
    };
};

type VideoListResponse = {
    data: {
        items?: Array<{
            id: string;
            contentDetails?: {
                duration: string;
            };
        }>;
    };
};

export interface Video {
    id: string;
    title: string;
    description?: string;
    publishedAt: number;
    channelId: string;
    channelTitle: string;
    thumbnail: Record<string, { url: string }>;
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

// TODO: See if we can optimise this to call the API less often, could be a way to fetch duration along with playlist items?
// TODO: Also see if we can save upload playlist in the sub object
// GET /api/feed
// 1. Fetches user's subscriptions (explicitly enabled) from database
// 2. For each subscription, fetches uploads playlist from the API
// 3. Fetches each video's details from the uploads playlist, to extract duration
// 4. Saves/updates video details in the database
// 5. Returns the list of videos as JSON response
export async function GET() {
    const client = new MongoClient(mongoUri!);

    try {
        await client.connect();
        const db = client.db(dbName);

        // Refresh the access token if needed
        const authenticatedOAuth2Client = await refreshTokenIfNeeded();

        const subscriptions = await db
            .collection("subscriptions")
            .find({
                enabled: true, // Only fetch explicitly enabled subscriptions
            })
            .toArray();

        // Initialize the YouTube API client
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

        for (const subscription of subscriptions) {
            const channelId = subscription.channelId;
            const channelTitle = subscription.title;

            try {
                // Get the uploads playlist ID of the channel
                const channelsRequest: ChannelListRequest = {
                    part: ["contentDetails"],
                    id: [channelId],
                };
                const channelResponse = (await youtube.channels.list(
                    channelsRequest
                )) as ChannelListResponse;

                if (channelResponse.data.items?.[0]?.contentDetails) {
                    const uploadsPlaylistId =
                        channelResponse.data.items[0].contentDetails
                            .relatedPlaylists?.uploads;

                    if (!uploadsPlaylistId) {
                        console.warn(
                            `No uploads playlist found for channel: ${channelId}`
                        );
                        continue;
                    }

                    // Get videos from the channel's uploads playlist
                    const searchRequest: SearchListRequest = {
                        part: ["snippet"],
                        channelId: channelId,
                        type: ["video"],
                        maxResults: 5,
                        order: "date",
                    };

                    // @ts-expect-error - googleapis library type definitions don't match for some reason
                    const videosResponse = (await youtube.search.list(
                        searchRequest
                    )) as SearchListResponse;

                    if (videosResponse.data.items) {
                        // Extract the video IDs from the response items
                        const videoIds = videosResponse.data.items.map(
                            (item: { id: { videoId: string } }) =>
                                item.id.videoId
                        );

                        // Fetch video details to get duration
                        const videosRequest: VideoListRequest = {
                            part: ["contentDetails"],
                            id: videoIds,
                        };
                        const videoDetailsResponse = (await youtube.videos.list(
                            videosRequest
                        )) as VideoListResponse;

                        // Create a map of video IDs to durations
                        const durationMap: { [key: string]: number } = {};

                        videoDetailsResponse.data.items?.forEach(
                            (item: {
                                id?: string;
                                contentDetails?: { duration?: string };
                            }) => {
                                if (!item.contentDetails?.duration) return;
                                const match =
                                    item.contentDetails.duration.match(
                                        /PT(\d+H)?(\d+M)?(\d+S)?/
                                    );

                                const hours = parseInt(match?.[1] || "0") || 0;
                                const minutes =
                                    parseInt(match?.[2] || "0") || 0;
                                const seconds =
                                    parseInt(match?.[3] || "0") || 0;
                                const totalSeconds =
                                    hours * 3600 + minutes * 60 + seconds;
                                if (item.id) {
                                    durationMap[item.id] = totalSeconds;
                                }
                            }
                        );

                        // For each video item, construct the Video object to push into database,
                        // ...and prepare the MongoDB update object
                        videosResponse.data.items.forEach(
                            (item: {
                                id: { videoId: string };
                                snippet: {
                                    title: string;
                                    description?: string;
                                    publishedAt: string;
                                    channelId: string;
                                    thumbnails: Record<string, { url: string }>;
                                };
                            }) => {
                                const videoDuration =
                                    durationMap[item.id.videoId] || 0;

                                const video: Video = {
                                    id: item.id.videoId,

                                    title: item.snippet.title,
                                    description: item.snippet.description,

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
                            }
                        );
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
