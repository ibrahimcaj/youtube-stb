# YouTube STB

Your YouTube subscription feed reimagined as a constantly streaming TV channel.

Name is derived from the old STB (Set Top Box) devices used for watching TV channels.

## Why?

This idea came from spending too much time looking through my YouTube feed trying to find something to watch, and noticing I'd become overly indecisive about what to watch.

## How does it work?

The application uses the YouTube API to fetch your subscriptions and aggregate videos from channels you select.

It organizes these videos into a queue and simulates a TV guide. Based on a defined start epoch & video durations, it determines which video should be playing at any given moment.

This is currently a personal proof-of-concept that I self-host myself. If you'd like to self-host/contribute to/test it yourself, see below.

## TODOs

1. Auto-clean timeline
    - Currently, the videos get infinitely aggregated into the collection. This will cause performance issues withing a few days of aggregating videos.
2. Create a profile manager
    - Add a way to create and manage profiles for multiple YouTube users.
3. Authentification through the frontend

## Development

_Note: For this project, I've used `pnpm` as the package manager, but it should work with any other cross-compatible package manager as well._

Requirements:

-   **YouTube API OAuth client**
    -   Make sure YouTube API is enabled for your Google Cloud project under [Enabled APIs and services](https://console.cloud.google.com/apis/dashboard)
    -   Create a YouTube OAuth2 Client on the [Credentials page](https://console.cloud.google.com/apis/api/youtube.googleapis.com/credentials)
    -   Add yourself as a test user on the Auth Platform's [Audience page](https://console.cloud.google.com/auth/audience) (this is required for non-verified clients)
-   **MongoDB cluster**
    -   You will need the _connection string_ & _database name_ you are going to use.

Initial setup:

-   Add `MONGODB_URI`, `MONGODB_DB`, `GOOGLE_CLIENT_ID`, `GOOGLE_CLIENT_SECRET` to your environment variables.
-   Run `pnpm i` to fetch all of the dependencies
-   `pnpm dev` to start the Next.js server

You should be all set!
