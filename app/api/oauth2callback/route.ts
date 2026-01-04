import { MongoClient } from "mongodb";
import { google } from "googleapis";

const mongoUri = process.env.MONGODB_URI;
const dbName = process.env.MONGODB_DB;

const googleClientID = process.env.GOOGLE_CLIENT_ID;
const googleClientSecret = process.env.GOOGLE_CLIENT_SECRET;

if (!mongoUri || !dbName || !googleClientID || !googleClientSecret) {
    throw new Error(
        "Missing MongoDB connection string, database name, or Google OAuth credentials"
    );
}

// Configure the OAuth2 client
const oauth2Client = new google.auth.OAuth2(
    googleClientID!,
    googleClientSecret!,
    "http://localhost:3000/api/oauth2callback"
);

// TODO: Allow creation of more profiles
// GET /api/oauth2callback
// 1. Receives the OAuth2 callback with authorization code
// 2. Exchanges the code for access and refresh tokens
// 3. Stores the tokens in the only profile document in MongoDB
export async function GET(request: Request) {
    const client = new MongoClient(mongoUri!);
    const { code } = Object.fromEntries(new URL(request.url).searchParams);

    try {
        const { tokens } = await oauth2Client.getToken(code);
        await client.connect();
        const db = client.db(dbName);

        await db.collection("profiles").updateOne(
            {},
            {
                $set: { tokens },
            },
            { upsert: true }
        );

        return Response.json({ message: "Authentication successful!" });
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
