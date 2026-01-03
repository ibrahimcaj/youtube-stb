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

// configure the OAuth2 client
const oauth2Client = new google.auth.OAuth2(
    googleClientID!,
    googleClientSecret!,
    "http://localhost:3000/api/oauth2callback"
);

export async function GET(request: Request) {
    const client = new MongoClient(mongoUri!);
    const { code } = Object.fromEntries(new URL(request.url).searchParams);
    console.log("OAuth2 code received:", code);

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

        console.log("Authentication successful!", tokens);
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
