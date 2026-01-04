import { MongoClient } from "mongodb";
import { google } from "googleapis";
import { Subscription } from "../subscriptions/route";
import { Video } from "../feed/route";
import { refreshTokenIfNeeded, createOAuth2Client } from "@/lib/authUtils";

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

function getVideoAtEpoch(
    videos: Video[],
    epoch: number,
    startTime: number
): {
    videoId: string;
    timestamp: number;
    video: Video;
    currentIndex: number;
} | null {
    const elapsedSeconds = epoch - startTime;

    let accumulatedTime = 0;
    for (let i = 0; i < videos.length; i++) {
        const video = videos[i];
        const videoEndTime = accumulatedTime + video.duration;

        if (elapsedSeconds < videoEndTime) {
            const timestamp = elapsedSeconds - accumulatedTime;
            return {
                videoId: video.id,
                timestamp,
                video,
                currentIndex: i,
            };
        }

        accumulatedTime = videoEndTime;
    }

    return null;
}

export async function GET(request: Request) {
    const client = new MongoClient(mongoUri!);

    try {
        await client.connect();
        const db = client.db(dbName);

        // Refresh token if needed
        const authenticatedOAuth2Client = await refreshTokenIfNeeded();

        const url = new URL(request.url);
        const epoch =
            parseInt(url.searchParams.get("epoch") || "0") ||
            Math.floor(Date.now() / 1000);
        const startTime = parseInt(
            url.searchParams.get("startTime") || "1767443468"
        );

        if (!startTime) {
            return Response.json(
                { message: "startTime parameter is required" },
                { status: 400 }
            );
        }

        const docs = await db
            .collection("subscriptions")
            .find({
                enabled: true,
            })
            .toArray();

        // @ts-expect-error -- IGNORE --
        const videos: Video[] = (await db
            .collection("feed")
            .find({
                channelId: { $in: docs.map((sub) => sub.channelId) },
            })
            .sort({ publishedAt: -1 })
            .toArray()) as Video[];
        console.log(videos);

        // If no videos, indicate feed needs to be refreshed
        if (videos.length === 0) {
            return Response.json(
                { message: "No videos available. Please refresh the feed." },
                { status: 204 }
            );
        }

        const youtube = google.youtube({
            version: "v3",
            auth: authenticatedOAuth2Client,
        });

        let currentVideo = getVideoAtEpoch(videos, epoch, startTime);

        // If no current video (epoch is beyond all videos), return the last video at timestamp 0
        if (!currentVideo) {
            const lastVideo = videos[videos.length - 1];
            currentVideo = {
                videoId: lastVideo.id,
                timestamp: 0,
                video: lastVideo,
                currentIndex: videos.length - 1,
            };
        }

        // Get 5 videos before and 5 videos after
        let beforeVideos: Video[] = [];
        let afterVideos: Video[] = [];
        let totalAfterCount = 0;
        if (currentVideo) {
            const beforeStartIndex = Math.max(0, currentVideo.currentIndex - 5);
            const afterEndIndex = Math.min(
                videos.length,
                currentVideo.currentIndex + 6
            );
            beforeVideos = videos.slice(
                beforeStartIndex,
                currentVideo.currentIndex
            );
            afterVideos = videos.slice(
                currentVideo.currentIndex + 1,
                afterEndIndex
            );
            // Total count of all videos after the current video
            totalAfterCount = videos.length - currentVideo.currentIndex - 1;
        }

        return Response.json({
            current: currentVideo,
            before: beforeVideos,
            after: afterVideos,
            afterCount: totalAfterCount,
            elapsedSeconds: epoch - startTime,
            totalVideos: videos.length,
        });
    } catch (error) {
        console.error("Error getting timeline:", error);
        return Response.json(
            { message: "Failed to fetch timeline!" },
            { status: 500 }
        );
    } finally {
        await client.close();
    }
}
