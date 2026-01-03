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

export async function refreshTokenIfNeeded() {
    const client = new MongoClient(mongoUri!);

    try {
        await client.connect();
        const db = client.db(dbName);

        const profileDoc = await db.collection("profiles").findOne({});
        if (!profileDoc?.tokens) {
            throw new Error("No tokens found in database");
        }

        const oauth2Client = new google.auth.OAuth2(
            googleClientID!,
            googleClientSecret!,
            "http://localhost:3000/api/oauth2callback"
        );

        oauth2Client.setCredentials(profileDoc.tokens);

        // Check if token is expired or about to expire (within 5 minutes)
        const expiryDate = oauth2Client.credentials.expiry_date;
        const now = Date.now();
        const shouldRefresh = !expiryDate || expiryDate - now < 5 * 60 * 1000;

        if (shouldRefresh && oauth2Client.credentials.refresh_token) {
            const { credentials } = await oauth2Client.refreshAccessToken();
            oauth2Client.setCredentials(credentials);

            // Save new tokens to database
            await db.collection("profiles").updateOne(
                {},
                {
                    $set: { tokens: credentials },
                },
                { upsert: true }
            );

            console.log("Token refreshed successfully");
            return oauth2Client;
        }

        return oauth2Client;
    } catch (error) {
        console.error("Error refreshing token:", error);
        throw error;
    } finally {
        await client.close();
    }
}

export function createOAuth2Client() {
    return new google.auth.OAuth2(
        googleClientID!,
        googleClientSecret!,
        "http://localhost:3000/api/oauth2callback"
    );
}
