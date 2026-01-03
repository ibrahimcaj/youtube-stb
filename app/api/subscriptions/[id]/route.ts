import { MongoClient } from "mongodb";
import { google } from "googleapis";
import { Subscription } from "../route";

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
const oauth2Client = new google.auth.OAuth2(
    googleClientID!,
    googleClientSecret!,
    "http://localhost:3000/api/oauth2callback"
);

export async function POST(request: Request) {
    const client = new MongoClient(mongoUri!);

    try {
        await client.connect();
        const db = client.db(dbName);

        // Get the [id] param from the request URL
        const url = new URL(request.url);
        const id = url.pathname.split("/").pop();
        console.log("id param:", id);

        const sub = await db.collection<Subscription>("subscriptions").findOne({
            channelId: id,
        });
        console.log(sub);

        await db.collection("subscriptions").updateOne(
            {
                channelId: id,
            },
            {
                $set: {
                    enabled: !sub?.enabled,
                },
            }
        );

        return Response.json({
            success: true,
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
