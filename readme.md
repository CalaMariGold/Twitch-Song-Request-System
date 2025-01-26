# Song Request System for Drum Streams

## Project Overview
This project is a song request system designed for Twitch drum streams. It allows viewers to submit song requests via Twitch channel points or donations, which are added to a visible queue. The system prioritizes donation requests over channel point requests and provides a real-time display of the queue on a web app. It is built using Node.js, Express, SQLite, and integrates with Twitch and Streamer.bot.

---

## Features
- **Twitch Integration**: 
  - Viewers log in via Twitch OAuth for secure request submissions.
- **Channel Point Requests**: 
  - Requests submitted using a specific Twitch channel point reward are automatically added to the queue.
- **Donation Requests**: 
  - Higher priority requests submitted via donations, integrated through Streamer.bot.
- **Request Queue**: 
  - A prioritized queue that dynamically updates in real time.
- **Web Display**: 
  - A lightweight front-end to show the queue to viewers and manage song requests.
- **Real-Time Updates**: 
  - Queue updates are pushed live to the front-end using WebSockets.

---

## Tech Stack
- **Backend**: Node.js, Express
- **Database**: SQLite
- **Frontend**: HTML, CSS, JavaScript
- **WebSocket Library**: `socket.io`
- **Twitch Integration**: Twitch API (OAuth)
- **Streamer.bot Integration**: HTTP requests for channel point and donation events

---

## Database Schema
### 1. Users Table
| Column      | Type    | Description                    |
|-------------|---------|--------------------------------|
| `id`        | INTEGER | Primary key                   |
| `twitch_id` | TEXT    | Twitch user ID (unique)       |
| `name`      | TEXT    | Twitch display name           |

### 2. Requests Table
| Column        | Type    | Description                                                |
|---------------|---------|------------------------------------------------------------|
| `id`          | INTEGER | Primary key                                               |
| `user_id`     | INTEGER | Foreign key referencing `users.id` (INDEX RECOMMENDED)    |
| `song_title`  | TEXT    | Title of the requested song                                |
| `song_link`   | TEXT    | Link to the song (YouTube/Spotify)                        |
| `type`        | TEXT    | Type of request (`channel_point` or `donation`)           |
| `priority`    | INTEGER | Priority (INDEX RECOMMENDED for sorting performance)      |
| `timestamp`   | TEXT    | Time when the request was made (default: current time)    |

### 3. Settings Table
| Column     | Type    | Description                 |
|------------|---------|-----------------------------|
| `key`      | TEXT    | Setting name (primary key) |
| `value`    | TEXT    | Setting value              |

---

## API Routes
### Authentication
- **`GET /auth/twitch`**: Initiate Twitch OAuth login.
- **`GET /auth/twitch/callback`**: Handle OAuth callback and store user details.

### Requests
- **`POST /requests/channel-point`**: Add a request from a channel point redemption.
  - **Payload**:
    ```json
    {
      "user_id": "Twitch user ID",
      "song_link": "YouTube or Spotify link"
    }
    ```
- **`POST /requests/donation`**: Add a donation-based request with higher priority.
  - **Payload**:
    ```json
    {
      "user_id": "Twitch user ID",
      "song_link": "YouTube or Spotify link",
      "donation_amount": "Amount donated"
    }
    ```

### Queue
- **`GET /queue`**: Retrieve the current request queue for display.
  - **Response**:
    ```json
    {
      "queue": [
        {
          "song_title": "Song Title",
          "requester": "User Name",
          "type": "Request Type"
        }
      ]
    }
    ```

### Queue Management (Streamer Only)
- **`POST /queue/pause`**: Toggle request submissions on/off
  - **Payload**: 
    ```json
    {"enabled": boolean}
    ```
- **`GET /queue/status`**: Check if requests are enabled
  - **Response**:
    ```json
    {"enabled": true, "queue_length": 5}
    ```

---

## Front-End Requirements
- **Responsive Design**: Queue should be visible and clear on all devices.
- **Real-Time Updates**: Use WebSockets to reflect changes immediately.
- **Error Handling**: Display friendly messages for invalid song links or other errors.
- **Accessibility:** ARIA labels for screen readers, proper contrast ratios
- **Queue Controls:** (For streamer) Pause/clear queue buttons (hidden behind auth)
- **Streamer Overlay:** 
  - Only show "Currently Playing" and "Next Up" (max 2 entries)
  - Auto-hide queue when empty with "Request Songs!" message
  - Add `/queue-overlay` endpoint with minimal CSS for OBS embedding

---

## Real-Time Updates
- Use `socket.io` for real-time communication between the server and front-end.
- Push queue updates (e.g., new requests, reordering) to connected clients.

---

## Validation
- **Song Links**: Verify that submitted links are valid YouTube or Spotify URLs.
- **API Payloads**: Ensure all required fields are present and correctly formatted.
- **Error Logging**: Log errors to a file or database for debugging.
- **Rate Limiting:** Add per-user request limits to prevent spam
- **Input Sanitization:** Protect against SQL injection/XSS in song links
- **Request State:** Reject submissions when queue is paused
- **Overlay Status:** Display "Requests Paused" banner when disabled

---

## Future Enhancements
- Custom Donation Integration: Expand support to platforms like PayPal or Stripe.
- Admin Interface: Allow streamers to manage the queue manually.
- Enhanced Validation: Add link preview or metadata validation for song requests.

## Setup Guide

1. `npm install` 
2. Configure `.env` with Twitch credentials
3. Import Streamer.bot template (provided)
4. Add browser sources to OBS:
   - Main Queue: `http://localhost:3000/queue-overlay`
   - Control Panel: `http://localhost:3000/streamer-controls` (private)