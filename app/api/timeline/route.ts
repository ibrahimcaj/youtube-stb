import { MongoClient } from "mongodb";
import { Video } from "../feed/route";
import { Subscription } from "../subscriptions/route";

const mongoUri = process.env.MONGODB_URI;
const dbName = process.env.MONGODB_DB;

const googleClientID = process.env.GOOGLE_CLIENT_ID;
const googleClientSecret = process.env.GOOGLE_CLIENT_SECRET;

if (!mongoUri || !dbName || !googleClientID || !googleClientSecret) {
    throw new Error(
        "Missing MongoDB connection string, database name, or Google OAuth credentials"
    );
}

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
    const elapsedSeconds = epoch - startTime; // Gets the time difference from the epoch to the start time

    let accumulatedTime = 0; // This is used to track the total duration as we iterate through videos
    for (let i = 0; i < videos.length; i++) {
        const video = videos[i];

        // Sums the accumulated time so far with the current video's duration, used to determine if the epoch falls within this video
        const videoEndTime = accumulatedTime + video.duration;

        if (elapsedSeconds < videoEndTime) {
            // If the relative epoch time is within the current video's duration
            const timestamp = elapsedSeconds - accumulatedTime; // Relative elapsed time minus accumulated time before this video
            return {
                videoId: video.id,
                timestamp,
                video,
                currentIndex: i,
            };
        }

        // Else, update accumulated time and continue to next video
        accumulatedTime = videoEndTime;
    }

    return null;
}

// GET /api/timeline
// 1. Fetches all enabled subscriptions from database
// 2. Fetches all videos from enabled subscriptions
// 3. Determines the current video at the given epoch and returns surrounding videos
export async function GET(request: Request) {
    const client = new MongoClient(mongoUri!);

    try {
        await client.connect();
        const db = client.db(dbName);

        const url = new URL(request.url);
        const epoch =
            parseInt(url.searchParams.get("epoch") || "0") ||
            Math.floor(Date.now() / 1000);
        const startTime = parseInt(
            url.searchParams.get("startTime") || "1767906120"
        );

        if (!startTime) {
            return Response.json(
                { message: "startTime parameter is required" },
                { status: 400 }
            );
        }

        // Fetch all enabled subscriptions
        const subscriptions = await db
            .collection<Subscription>("subscriptions")
            .find({
                enabled: true,
            })
            .toArray();

        // Fetch all videos from enabled subscriptions
        const videos = await db
            .collection<Video>("feed")
            .find({
                channelId: { $in: subscriptions.map((sub) => sub.channelId) },
            })
            .sort({ publishedAt: 1 })
            .toArray();

        // If no videos, indicate feed needs to be refreshed
        if (videos.length === 0) {
            return Response.json(
                { message: "No videos available. Please refresh the feed." },
                { status: 204 }
            );
        }

        // Find the current video at the given epoch
        let currentVideo = getVideoAtEpoch(videos, epoch, startTime);

        // If no current video (epoch is after all videos), return the last video at timestamp 0
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
