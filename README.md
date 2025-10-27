# ConvoHub API Documentation

This document provides comprehensive information about all available APIs in the ConvoHub chat application, including authentication, user management, chat operations, and messaging.

---

## Table of Contents

1. [Authentication APIs](#authentication-apis)
2. [User Management APIs](#user-management-apis)
3. [Chat Management APIs](#chat-management-apis)
4. [Message APIs](#message-apis)
5. [**File Upload APIs**](#file-upload-apis) ⭐ NEW
6. [Socket.IO Events](#socketio-events)

---

## Base URL

```
http://localhost:3001/api
```

---

## Authentication APIs

### 1. Register New User

Creates a new user account and sends OTP for verification.

**Endpoint:** `POST /auth/register`

**Request Body:**
```json
{
  "username": "johndoe",
  "password": "SecurePass123!",
  "email": "john@example.com",
  "phone": "+1234567890",
  "full_name": "John Doe"
}
```

**Response (Success):**
```json
{
  "message": "OTP sent for registration",
  "userId": 1,
  "otpSentTo": "email",
  "destination": "john@example.com",
  "expiresAt": "2024-01-15T10:35:00.000Z",
  "devOTP": "123456"
}
```

**cURL Example:**
```bash
curl -X POST http://localhost:3001/api/auth/register \
  -H "Content-Type: application/json" \
  -d '{
    "username": "johndoe",
    "password": "SecurePass123!",
    "email": "john@example.com",
    "full_name": "John Doe"
  }'
```

---

### 2. Verify Registration OTP

Verifies the OTP sent during registration and activates the account.

**Endpoint:** `POST /auth/verify-registration-otp`

**Request Body:**
```json
{
  "userId": 1,
  "otpCode": "123456"
}
```

**Response (Success):**
```json
{
  "message": "Registration verified successfully. You can now log in."
}
```

**cURL Example:**
```bash
curl -X POST http://localhost:3001/api/auth/verify-registration-otp \
  -H "Content-Type: application/json" \
  -d '{
    "userId": 1,
    "otpCode": "123456"
  }'
```

---

### 3. Login

Authenticates user credentials and sends OTP for two-factor authentication.

**Endpoint:** `POST /auth/login`

**Request Body:**
```json
{
  "username": "johndoe",
  "password": "SecurePass123!"
}
```

**Response (Success):**
```json
{
  "message": "OTP sent successfully",
  "userId": 1,
  "otpSentTo": "email",
  "destination": "john@example.com",
  "expiresAt": "2024-01-15T10:40:00.000Z",
  "devOTP": "654321"
}
```

**cURL Example:**
```bash
curl -X POST http://localhost:3001/api/auth/login \
  -H "Content-Type: application/json" \
  -d '{
    "username": "johndoe",
    "password": "SecurePass123!"
  }'
```

---

### 4. Verify Login OTP

Completes the login process by verifying the OTP and returns JWT tokens.

**Endpoint:** `POST /auth/verify-otp`

**Request Body:**
```json
{
  "userId": 1,
  "otpCode": "654321"
}
```

**Response (Success):**
```json
{
  "message": "Login successful",
  "user": {
    "user_id": 1,
    "username": "johndoe",
    "email": "john@example.com",
    "full_name": "John Doe",
    "profile_pic": null,
    "status_message": "Hey there! I am using ConvoHub",
    "verified": true
  },
  "accessToken": "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9...",
  "refreshToken": "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9..."
}
```

**cURL Example:**
```bash
curl -X POST http://localhost:3001/api/auth/verify-otp \
  -H "Content-Type: application/json" \
  -d '{
    "userId": 1,
    "otpCode": "654321"
  }'
```

---

### 5. Resend OTP

Resends OTP for registration or login verification.

**Endpoint:** `POST /auth/resend-otp`

**Request Body:**
```json
{
  "userId": 1,
  "otpType": "login"
}
```

**Response (Success):**
```json
{
  "message": "OTP resent successfully",
  "otpSentTo": "email",
  "destination": "john@example.com",
  "expiresAt": "2024-01-15T10:45:00.000Z",
  "devOTP": "789012"
}
```

**cURL Example:**
```bash
curl -X POST http://localhost:3001/api/auth/resend-otp \
  -H "Content-Type: application/json" \
  -d '{
    "userId": 1,
    "otpType": "login"
  }'
```

---

### 6. Refresh Access Token

Generates a new access token using a valid refresh token.

**Endpoint:** `POST /auth/refresh-token`

**Request Body:**
```json
{
  "refreshToken": "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9..."
}
```

**Response (Success):**
```json
{
  "message": "Token refreshed successfully",
  "accessToken": "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9...",
  "user": {
    "user_id": 1,
    "username": "johndoe",
    "email": "john@example.com",
    "full_name": "John Doe"
  }
}
```

**cURL Example:**
```bash
curl -X POST http://localhost:3001/api/auth/refresh-token \
  -H "Content-Type: application/json" \
  -d '{
    "refreshToken": "YOUR_REFRESH_TOKEN"
  }'
```

---

### 7. Logout

Invalidates the refresh token and logs out the user.

**Endpoint:** `POST /auth/logout`

**Headers:**
```
Authorization: Bearer <access_token>
```

**Response (Success):**
```json
{
  "message": "Logged out successfully"
}
```

**cURL Example:**
```bash
curl -X POST http://localhost:3001/api/auth/logout \
  -H "Authorization: Bearer YOUR_ACCESS_TOKEN"
```

---

### 8. Get Current User

Retrieves the authenticated user's profile information.

**Endpoint:** `GET /auth/me`

**Headers:**
```
Authorization: Bearer <access_token>
```

**Response (Success):**
```json
{
  "user": {
    "user_id": 1,
    "username": "johndoe",
    "email": "john@example.com",
    "full_name": "John Doe",
    "phone": "+1234567890",
    "profile_pic": null,
    "status_message": "Hey there! I am using ConvoHub",
    "created_at": "2024-01-15T10:00:00.000Z"
  }
}
```

**cURL Example:**
```bash
curl -X GET http://localhost:3001/api/auth/me \
  -H "Authorization: Bearer YOUR_ACCESS_TOKEN"
```

---

## User Management APIs

### 9. Get All Users

Retrieves a paginated list of all users.

**Endpoint:** `GET /users`

**Query Parameters:**
- `page` (optional): Page number (default: 1)
- `limit` (optional): Items per page (default: 20)
- `search` (optional): Search term for username, full name, or email

**Headers:**
```
Authorization: Bearer <access_token> (optional)
```

**Response (Success):**
```json
{
  "users": [
    {
      "user_id": 1,
      "username": "johndoe",
      "email": "john@example.com",
      "full_name": "John Doe",
      "profile_pic": null,
      "status_message": "Hey there! I am using ConvoHub",
      "created_at": "2024-01-15T10:00:00.000Z"
    }
  ],
  "pagination": {
    "total": 50,
    "page": 1,
    "limit": 20,
    "totalPages": 3
  }
}
```

**cURL Example:**
```bash
curl -X GET "http://localhost:3001/api/users?page=1&limit=20&search=john"
```

---

### 10. Get User by ID

Retrieves detailed information about a specific user.

**Endpoint:** `GET /users/:id`

**Headers:**
```
Authorization: Bearer <access_token>
```

**Response (Success):**
```json
{
  "user": {
    "user_id": 1,
    "username": "johndoe",
    "email": "john@example.com",
    "phone": "+1234567890",
    "full_name": "John Doe",
    "profile_pic": null,
    "status_message": "Hey there! I am using ConvoHub",
    "created_at": "2024-01-15T10:00:00.000Z"
  }
}
```

**cURL Example:**
```bash
curl -X GET http://localhost:3001/api/users/1 \
  -H "Authorization: Bearer YOUR_ACCESS_TOKEN"
```

---

### 11. Get User by Username

Retrieves user information by username.

**Endpoint:** `GET /users/username/:username`

**Headers:**
```
Authorization: Bearer <access_token> (optional)
```

**Response (Success):**
```json
{
  "user_id": 1,
  "username": "johndoe",
  "full_name": "John Doe",
  "email": "john@example.com",
  "phone": "+1234567890",
  "profile_pic": null,
  "status_message": "Hey there! I am using ConvoHub",
  "created_at": "2024-01-15T10:00:00.000Z"
}
```

**cURL Example:**
```bash
curl -X GET http://localhost:3001/api/users/username/johndoe
```

---

### 12. Search Users by Name

Searches for users by full name or username.

**Endpoint:** `GET /users/search`

**Query Parameters:**
- `query` (required): Search term

**Headers:**
```
Authorization: Bearer <access_token> (optional)
```

**Response (Success):**
```json
[
  {
    "user_id": 1,
    "username": "johndoe",
    "full_name": "John Doe",
    "profile_pic": null,
    "status_message": "Hey there! I am using ConvoHub"
  }
]
```

**cURL Example:**
```bash
curl -X GET "http://localhost:3001/api/users/search?query=john"
```

---

### 13. Update User Profile

Updates user profile information.

**Endpoint:** `PUT /users/:id`

**Headers:**
```
Authorization: Bearer <access_token>
```

**Request Body:**
```json
{
  "full_name": "John Smith",
  "email": "johnsmith@example.com",
  "status_message": "Busy coding!",
  "profile_pic": "https://example.com/avatar.jpg"
}
```

**Response (Success):**
```json
{
  "message": "User updated successfully",
  "user": {
    "user_id": 1,
    "username": "johndoe",
    "email": "johnsmith@example.com",
    "full_name": "John Smith",
    "profile_pic": "https://example.com/avatar.jpg",
    "status_message": "Busy coding!",
    "created_at": "2024-01-15T10:00:00.000Z"
  }
}
```

**cURL Example:**
```bash
curl -X PUT http://localhost:3001/api/users/1 \
  -H "Authorization: Bearer YOUR_ACCESS_TOKEN" \
  -H "Content-Type: application/json" \
  -d '{
    "full_name": "John Smith",
    "status_message": "Busy coding!"
  }'
```

---

### 14. Update User Status

Updates only the user's status message.

**Endpoint:** `PUT /users/:id/status`

**Headers:**
```
Authorization: Bearer <access_token>
```

**Request Body:**
```json
{
  "status_message": "Available for chat"
}
```

**Response (Success):**
```json
{
  "user_id": 1,
  "username": "johndoe",
  "full_name": "John Doe",
  "status_message": "Available for chat"
}
```

**cURL Example:**
```bash
curl -X PUT http://localhost:3001/api/users/1/status \
  -H "Authorization: Bearer YOUR_ACCESS_TOKEN" \
  -H "Content-Type: application/json" \
  -d '{
    "status_message": "Available for chat"
  }'
```

---

### 15. Update Password

Changes the user's password.

**Endpoint:** `PUT /users/:id/password`

**Headers:**
```
Authorization: Bearer <access_token>
```

**Request Body:**
```json
{
  "userId": 1,
  "currentPassword": "OldPass123!",
  "newPassword": "NewSecurePass456!"
}
```

**Response (Success):**
```json
{
  "message": "Password updated successfully"
}
```

**cURL Example:**
```bash
curl -X PUT http://localhost:3001/api/users/1/password \
  -H "Authorization: Bearer YOUR_ACCESS_TOKEN" \
  -H "Content-Type: application/json" \
  -d '{
    "userId": 1,
    "currentPassword": "OldPass123!",
    "newPassword": "NewSecurePass456!"
  }'
```

---

### 16. Check Username Availability

Checks if a username is available for registration.

**Endpoint:** `GET /users/check-username/:username`

**Response (Success):**
```json
{
  "username": "johndoe",
  "available": false
}
```

**cURL Example:**
```bash
curl -X GET http://localhost:3001/api/users/check-username/johndoe
```

---

### 17. Check Email Availability

Checks if an email is available for registration.

**Endpoint:** `GET /users/check-email/:email`

**Response (Success):**
```json
{
  "email": "john@example.com",
  "available": false
}
```

**cURL Example:**
```bash
curl -X GET http://localhost:3001/api/users/check-email/john@example.com
```

---

### 18. Get User Statistics

Retrieves statistics for a specific user.

**Endpoint:** `GET /users/:id/stats`

**Headers:**
```
Authorization: Bearer <access_token>
```

**Response (Success):**
```json
{
  "totalMessages": 150,
  "totalChats": 8,
  "unreadNotifications": 3,
  "activeSessions": 2
}
```

**cURL Example:**
```bash
curl -X GET http://localhost:3001/api/users/1/stats \
  -H "Authorization: Bearer YOUR_ACCESS_TOKEN"
```

---

### 19. Get User Chats

Retrieves all chats for a specific user.

**Endpoint:** `GET /users/:id/chats`

**Headers:**
```
Authorization: Bearer <access_token>
```

**Response (Success):**
```json
[
  {
    "chat_id": 1,
    "chat": {
      "chat_id": 1,
      "chat_type": "private",
      "chat_name": null,
      "created_at": "2024-01-15T10:00:00.000Z",
      "members": [
        {
          "user": {
            "user_id": 1,
            "username": "johndoe",
            "full_name": "John Doe",
            "profile_pic": null
          }
        }
      ],
      "messages": [
        {
          "message_id": 10,
          "message_text": "Hello!",
          "created_at": "2024-01-15T11:00:00.000Z",
          "sender": {
            "username": "janedoe",
            "full_name": "Jane Doe"
          }
        }
      ]
    }
  }
]
```

**cURL Example:**
```bash
curl -X GET http://localhost:3001/api/users/1/chats \
  -H "Authorization: Bearer YOUR_ACCESS_TOKEN"
```

---

### 20. Block User

Blocks another user.

**Endpoint:** `POST /users/:id/block`

**Headers:**
```
Authorization: Bearer <access_token>
```

**Request Body:**
```json
{
  "blockedUserId": 5
}
```

**Response (Success):**
```json
{
  "message": "User blocked successfully",
  "blockedUser": {
    "user_id": 1,
    "blocked_user_id": 5,
    "blocked_at": "2024-01-15T12:00:00.000Z"
  }
}
```

**cURL Example:**
```bash
curl -X POST http://localhost:3001/api/users/1/block \
  -H "Authorization: Bearer YOUR_ACCESS_TOKEN" \
  -H "Content-Type: application/json" \
  -d '{
    "blockedUserId": 5
  }'
```

---

### 21. Unblock User

Unblocks a previously blocked user.

**Endpoint:** `DELETE /users/:id/unblock/:blockedUserId`

**Headers:**
```
Authorization: Bearer <access_token>
```

**Response (Success):**
```json
{
  "message": "User unblocked successfully"
}
```

**cURL Example:**
```bash
curl -X DELETE http://localhost:3001/api/users/1/unblock/5 \
  -H "Authorization: Bearer YOUR_ACCESS_TOKEN"
```

---

### 22. Get Blocked Users

Retrieves list of users blocked by the current user.

**Endpoint:** `GET /users/:id/blocked`

**Headers:**
```
Authorization: Bearer <access_token>
```

**Response (Success):**
```json
[
  {
    "user_id": 1,
    "blocked_user_id": 5,
    "blocked_at": "2024-01-15T12:00:00.000Z",
    "blockedUser": {
      "user_id": 5,
      "username": "spammer",
      "full_name": "Spam User",
      "profile_pic": null
    }
  }
]
```

**cURL Example:**
```bash
curl -X GET http://localhost:3001/api/users/1/blocked \
  -H "Authorization: Bearer YOUR_ACCESS_TOKEN"
```

---

## Chat Management APIs

### 23. Create Chat

Creates a new private or group chat.

**Endpoint:** `POST /chats`

**Headers:**
```
Authorization: Bearer <access_token>
```

**Request Body (Private Chat):**
```json
{
  "chat_type": "private",
  "member_ids": [1, 2]
}
```

**Request Body (Group Chat):**
```json
{
  "chat_type": "group",
  "chat_name": "Project Team",
  "member_ids": [1, 2, 3, 4],
  "admin_id": 1
}
```

**Response (Success):**
```json
{
  "message": "Chat created successfully",
  "chat": {
    "chat_id": 5,
    "chat_type": "group",
    "chat_name": "Project Team",
    "created_at": "2024-01-15T12:00:00.000Z",
    "members": [
      {
        "user_id": 1,
        "joined_at": "2024-01-15T12:00:00.000Z",
        "user": {
          "user_id": 1,
          "username": "johndoe",
          "full_name": "John Doe",
          "profile_pic": null,
          "status_message": "Hey there!"
        }
      }
    ],
    "admins": [
      {
        "user_id": 1,
        "user": {
          "user_id": 1,
          "username": "johndoe",
          "full_name": "John Doe"
        }
      }
    ]
  }
}
```

**cURL Example:**
```bash
curl -X POST http://localhost:3001/api/chats \
  -H "Authorization: Bearer YOUR_ACCESS_TOKEN" \
  -H "Content-Type: application/json" \
  -d '{
    "chat_type": "group",
    "chat_name": "Project Team",
    "member_ids": [1, 2, 3],
    "admin_id": 1
  }'
```

---

### 24. Get Chat by ID

Retrieves details of a specific chat.

**Endpoint:** `GET /chats/:id`

**Headers:**
```
Authorization: Bearer <access_token>
```

**Response (Success):**
```json
{
  "chat": {
    "chat_id": 5,
    "chat_type": "group",
    "chat_name": "Project Team",
    "created_at": "2024-01-15T12:00:00.000Z",
    "members": [
      {
        "user": {
          "user_id": 1,
          "username": "johndoe",
          "full_name": "John Doe",
          "profile_pic": null,
          "status_message": "Hey there!"
        }
      }
    ],
    "admins": [
      {
        "user": {
          "user_id": 1,
          "username": "johndoe",
          "full_name": "John Doe"
        }
      }
    ],
    "messages": [
      {
        "message_id": 20,
        "message_text": "Welcome to the team!",
        "created_at": "2024-01-15T12:05:00.000Z",
        "sender": {
          "user_id": 1,
          "username": "johndoe",
          "full_name": "John Doe"
        }
      }
    ]
  }
}
```

**cURL Example:**
```bash
curl -X GET http://localhost:3001/api/chats/5 \
  -H "Authorization: Bearer YOUR_ACCESS_TOKEN"
```

---

### 25. Get User's Chats

Retrieves all chats for a specific user with pagination.

**Endpoint:** `GET /chats/user/:userId`

**Query Parameters:**
- `page` (optional): Page number (default: 1)
- `limit` (optional): Items per page (default: 20)

**Headers:**
```
Authorization: Bearer <access_token>
```

**Response (Success):**
```json
{
  "chats": [
    {
      "chat_id": 5,
      "chat_type": "group",
      "chat_name": "Project Team",
      "created_at": "2024-01-15T12:00:00.000Z",
      "members": [
        {
          "user": {
            "user_id": 2,
            "username": "janedoe",
            "full_name": "Jane Doe",
            "profile_pic": null
          }
        }
      ],
      "messages": [
        {
          "message_id": 20,
          "message_text": "Welcome!",
          "created_at": "2024-01-15T12:05:00.000Z",
          "sender": {
            "username": "johndoe",
            "full_name": "John Doe"
          }
        }
      ]
    }
  ],
  "count": 8
}
```

**cURL Example:**
```bash
curl -X GET "http://localhost:3001/api/chats/user/1?page=1&limit=20" \
  -H "Authorization: Bearer YOUR_ACCESS_TOKEN"
```

---

### 26. Update Chat

Updates chat details (name).

**Endpoint:** `PUT /chats/:id`

**Headers:**
```
Authorization: Bearer <access_token>
```

**Request Body:**
```json
{
  "chat_name": "Updated Team Name"
}
```

**Response (Success):**
```json
{
  "message": "Chat updated successfully",
  "chat": {
    "chat_id": 5,
    "chat_type": "group",
    "chat_name": "Updated Team Name",
    "created_at": "2024-01-15T12:00:00.000Z",
    "members": [...]
  }
}
```

**cURL Example:**
```bash
curl -X PUT http://localhost:3001/api/chats/5 \
  -H "Authorization: Bearer YOUR_ACCESS_TOKEN" \
  -H "Content-Type: application/json" \
  -d '{
    "chat_name": "Updated Team Name"
  }'
```

---

### 27. Add Chat Member

Adds a new member to a group chat.

**Endpoint:** `POST /chats/:chatId/members`

**Headers:**
```
Authorization: Bearer <access_token>
```

**Request Body:**
```json
{
  "user_id": 5
}
```

**Response (Success):**
```json
{
  "message": "Member added successfully",
  "member": {
    "chat_id": 5,
    "user_id": 5,
    "joined_at": "2024-01-15T13:00:00.000Z",
    "user": {
      "user_id": 5,
      "username": "newmember",
      "full_name": "New Member",
      "profile_pic": null
    }
  }
}
```

**cURL Example:**
```bash
curl -X POST http://localhost:3001/api/chats/5/members \
  -H "Authorization: Bearer YOUR_ACCESS_TOKEN" \
  -H "Content-Type: application/json" \
  -d '{
    "user_id": 5
  }'
```

---

### 28. Remove Chat Member

Removes a member from a group chat.

**Endpoint:** `DELETE /chats/:chatId/members/:userId`

**Headers:**
```
Authorization: Bearer <access_token>
```

**Response (Success):**
```json
{
  "message": "Member removed successfully"
}
```

**cURL Example:**
```bash
curl -X DELETE http://localhost:3001/api/chats/5/members/5 \
  -H "Authorization: Bearer YOUR_ACCESS_TOKEN"
```

---

### 29. Delete Chat

Deletes a chat and all associated messages.

**Endpoint:** `DELETE /chats/:id`

**Headers:**
```
Authorization: Bearer <access_token>
```

**Response (Success):**
```json
{
  "message": "Chat deleted successfully"
}
```

**cURL Example:**
```bash
curl -X DELETE http://localhost:3001/api/chats/5 \
  -H "Authorization: Bearer YOUR_ACCESS_TOKEN"
```

---

## Message APIs

### 30. Create Message

Creates a new message in a chat.

**Endpoint:** `POST /messages`

**Headers:**
```
Authorization: Bearer <access_token>
```

**Request Body:**
```json
{
  "chat_id": 5,
  "sender_id": 1,
  "message_text": "Hello everyone!",
  "message_type": "text"
}
```

**Response (Success):**
```json
{
  "message_id": 25,
  "chat_id": 5,
  "sender_id": 1,
  "message_text": "Hello everyone!",
  "message_type": "text",
  "created_at": "2024-01-15T13:30:00.000Z",
  "sender": {
    "user_id": 1,
    "username": "johndoe",
    "full_name": "John Doe",
    "profile_pic": null
  },
  "chat": {
    "chat_id": 5,
    "chat_name": "Project Team",
    "chat_type": "group"
  }
}
```

**cURL Example:**
```bash
curl -X POST http://localhost:3001/api/messages \
  -H "Authorization: Bearer YOUR_ACCESS_TOKEN" \
  -H "Content-Type: application/json" \
  -d '{
    "chat_id": 5,
    "sender_id": 1,
    "message_text": "Hello everyone!",
    "message_type": "text"
  }'
```

---

### 31. Get Messages by Chat

Retrieves all messages in a specific chat with pagination.

**Endpoint:** `GET /messages/chat/:chatId`

**Query Parameters:**
- `page` (optional): Page number (default: 1)
- `limit` (optional): Items per page (default: 50)
- `userId` (optional): User ID for permission check

**Headers:**
```
Authorization: Bearer <access_token>
```

**Response (Success):**
```json
{
  "messages": [
    {
      "message_id": 25,
      "chat_id": 5,
      "sender_id": 1,
      "message_text": "Hello everyone!",
      "message_type": "text",
      "created_at": "2024-01-15T13:30:00.000Z",
      "sender": {
        "user_id": 1,
        "username": "johndoe",
        "full_name": "John Doe",
        "profile_pic": null
      },
      "status": [
        {
          "status": "read",
          "updated_at": "2024-01-15T13:31:00.000Z"
        }
      ],
      "attachments": []
    }
  ],
  "pagination": {
    "currentPage": 1,
    "totalPages": 3,
    "totalMessages": 150,
    "hasNext": true,
    "hasPrev": false
  }
}
```

**cURL Example:**
```bash
curl -X GET "http://localhost:3001/api/messages/chat/5?page=1&limit=50&userId=1" \
  -H "Authorization: Bearer YOUR_ACCESS_TOKEN"
```

---

### 32. Get Message by ID

Retrieves a specific message with full details.

**Endpoint:** `GET /messages/:id`

**Headers:**
```
Authorization: Bearer <access_token>
```

**Response (Success):**
```json
{
  "message_id": 25,
  "chat_id": 5,
  "sender_id": 1,
  "message_text": "Hello everyone!",
  "message_type": "text",
  "created_at": "2024-01-15T13:30:00.000Z",
  "sender": {
    "user_id": 1,
    "username": "johndoe",
    "full_name": "John Doe",
    "profile_pic": null
  },
  "chat": {
    "chat_id": 5,
    "chat_name": "Project Team",
    "chat_type": "group"
  },
  "status": [
    {
      "message_id": 25,
      "user_id": 2,
      "status": "read",
      "updated_at": "2024-01-15T13:31:00.000Z",
      "user": {
        "user_id": 2,
        "username": "janedoe",
        "full_name": "Jane Doe"
      }
    }
  ],
  "attachments": []
}
```

**cURL Example:**
```bash
curl -X GET http://localhost:3001/api/messages/25 \
  -H "Authorization: Bearer YOUR_ACCESS_TOKEN"
```

---

### 33. Update Message

Updates the text of an existing message (only by sender).

**Endpoint:** `PUT /messages/:id`

**Headers:**
```
Authorization: Bearer <access_token>
```

**Request Body:**
```json
{
  "sender_id": 1,
  "message_text": "Updated message text"
}
```

**Response (Success):**
```json
{
  "message_id": 25,
  "chat_id": 5,
  "sender_id": 1,
  "message_text": "Updated message text",
  "message_type": "text",
  "created_at": "2024-01-15T13:30:00.000Z",
  "sender": {
    "user_id": 1,
    "username": "johndoe",
    "full_name": "John Doe",
    "profile_pic": null
  }
}
```

**cURL Example:**
```bash
curl -X PUT http://localhost:3001/api/messages/25 \
  -H "Authorization: Bearer YOUR_ACCESS_TOKEN" \
  -H "Content-Type: application/json" \
  -d '{
    "sender_id": 1,
    "message_text": "Updated message text"
  }'
```

---

### 34. Delete Message

Deletes a message (only by sender).

**Endpoint:** `DELETE /messages/:id`

**Headers:**
```
Authorization: Bearer <access_token>
```

**Request Body:**
```json
{
  "sender_id": 1
}
```

**Response (Success):**
```json
{
  "message": "Message deleted successfully"
}
```

**cURL Example:**
```bash
curl -X DELETE http://localhost:3001/api/messages/25 \
  -H "Authorization: Bearer YOUR_ACCESS_TOKEN" \
  -H "Content-Type: application/json" \
  -d '{
    "sender_id": 1
  }'
```

---

### 35. Mark Message as Read

Marks a specific message as read for a user.

**Endpoint:** `PUT /messages/:messageId/read/:userId`

**Headers:**
```
Authorization: Bearer <access_token>
```

**Response (Success):**
```json
{
  "message": "Message marked as read"
}
```

**cURL Example:**
```bash
curl -X PUT http://localhost:3001/api/messages/25/read/1 \
  -H "Authorization: Bearer YOUR_ACCESS_TOKEN"
```

---

### 36. Mark All Chat Messages as Read

Marks all messages in a chat as read for a specific user.

**Endpoint:** `PUT /messages/chat/:chatId/read-all/:userId`

**Headers:**
```
Authorization: Bearer <access_token>
```

**Response (Success):**
```json
{
  "message": "Marked 15 messages as read"
}
```

**cURL Example:**
```bash
curl -X PUT http://localhost:3001/api/messages/chat/5/read-all/1 \
  -H "Authorization: Bearer YOUR_ACCESS_TOKEN"
```

---

### 37. Get Unread Message Count

Gets the count of unread messages for a user.

**Endpoint:** `GET /messages/unread/:userId`

**Query Parameters:**
- `chatId` (optional): Filter by specific chat

**Headers:**
```
Authorization: Bearer <access_token>
```

**Response (Success):**
```json
{
  "unreadCount": 12
}
```

**cURL Example:**
```bash
curl -X GET "http://localhost:3001/api/messages/unread/1?chatId=5" \
  -H "Authorization: Bearer YOUR_ACCESS_TOKEN"
```

---

### 38. Search Messages

Searches for messages containing specific text.

**Endpoint:** `GET /messages/search/content`

**Query Parameters:**
- `query` (required): Search term
- `chatId` (optional): Filter by chat
- `userId` (optional): Filter by user's chats
- `page` (optional): Page number
- `limit` (optional): Items per page

**Headers:**
```
Authorization: Bearer <access_token>
```

**Response (Success):**
```json
[
  {
    "message_id": 25,
    "message_text": "Hello everyone!",
    "created_at": "2024-01-15T13:30:00.000Z",
    "sender": {
      "user_id": 1,
      "username": "johndoe",
      "full_name": "John Doe",
      "profile_pic": null
    },
    "chat": {
      "chat_id": 5,
      "chat_name": "Project Team",
      "chat_type": "group"
    }
  }
]
```

**cURL Example:**
```bash
curl -X GET "http://localhost:3001/api/messages/search/content?query=hello&chatId=5" \
  -H "Authorization: Bearer YOUR_ACCESS_TOKEN"
```

---

### 39. Add Message Attachment

Adds an attachment to a message.

**Endpoint:** `POST /messages/:messageId/attachments`

**Headers:**
```
Authorization: Bearer <access_token>
```

**Request Body:**
```json
{
  "file_url": "https://example.com/files/document.pdf",
  "file_type": "application/pdf",
  "file_size": 1024000
}
```

**Response (Success):**
```json
{
  "attachment_id": 10,
  "message_id": 25,
  "file_url": "https://example.com/files/document.pdf",
  "file_type": "application/pdf",
  "file_size": 1024000,
  "uploaded_at": "2024-01-15T13:35:00.000Z"
}
```

**cURL Example:**
```bash
curl -X POST http://localhost:3001/api/messages/25/attachments \
  -H "Authorization: Bearer YOUR_ACCESS_TOKEN" \
  -H "Content-Type: application/json" \
  -d '{
    "file_url": "https://example.com/files/document.pdf",
    "file_type": "application/pdf",
    "file_size": 1024000
  }'
```

---

### 40. Get Chat Message Statistics

Gets statistics about messages in a chat.

**Endpoint:** `GET /messages/chat/:chatId/stats`

**Headers:**
```
Authorization: Bearer <access_token>
```

**Response (Success):**
```json
{
  "totalMessages": 150,
  "messagesByType": [
    {
      "message_type": "text",
      "_count": {
        "message_type": 140
      }
    },
    {
      "message_type": "image",
      "_count": {
        "message_type": 10
      }
    }
  ],
  "messagesByUser": [
    {
      "sender_id": 1,
      "_count": {
        "sender_id": 75
      },
      "user": {
        "user_id": 1,
        "username": "johndoe",
        "full_name": "John Doe"
      }
    }
  ],
  "attachmentCount": 15
}
```

**cURL Example:**
```bash
curl -X GET http://localhost:3001/api/messages/chat/5/stats \
  -H "Authorization: Bearer YOUR_ACCESS_TOKEN"
```

---

## File Upload APIs

### Upload File with Message

Upload files (images, videos, documents, etc.) and create a message with attachment.

**Endpoint:** `POST /messages/upload`

**Authentication:** Required (JWT Bearer token)

**Content-Type:** `multipart/form-data`

**Request Body (Form Data):**
```
file: [File] - The file to upload
chat_id: [Number] - The chat ID
sender_id: [Number] - The sender's user ID
message_text: [String] (Optional) - Optional message text to accompany the file
```

**Supported File Types:**
- **Images**: JPEG, PNG, GIF, WebP, SVG
- **Videos**: MP4, MPEG, WebM, QuickTime
- **Audio**: MP3, WAV, WebM, OGG
- **Documents**: PDF, Word, Excel, PowerPoint, Text
- **Archives**: ZIP, RAR, 7Z

**Maximum File Size:** 50MB

**Example Request (JavaScript):**
```javascript
const formData = new FormData();
formData.append('file', fileInput.files[0]);
formData.append('chat_id', 1);
formData.append('sender_id', 1);
formData.append('message_text', 'Check this image!');

const response = await fetch('http://localhost:3001/api/messages/upload', {
  method: 'POST',
  headers: {
    'Authorization': 'Bearer YOUR_JWT_TOKEN'
  },
  body: formData
});

const data = await response.json();
```

**Example Request (cURL):**
```bash
curl -X POST http://localhost:3001/api/messages/upload \
  -H "Authorization: Bearer YOUR_JWT_TOKEN" \
  -F "file=@/path/to/image.jpg" \
  -F "chat_id=1" \
  -F "sender_id=1" \
  -F "message_text=Check this out!"
```

**Response (Success - 201):**
```json
{
  "message_id": 123,
  "chat_id": 1,
  "sender_id": 1,
  "message_text": "Check this image!",
  "message_type": "image",
  "created_at": "2025-10-24T10:30:00.000Z",
  "sender": {
    "user_id": 1,
    "username": "john_doe",
    "full_name": "John Doe",
    "profile_pic": null
  },
  "chat": {
    "chat_id": 1,
    "chat_name": "General",
    "chat_type": "group"
  },
  "attachments": [
    {
      "attachment_id": 45,
      "message_id": 123,
      "file_url": "/uploads/image-1729765800000-123456789.jpg",
      "file_type": "image/jpeg",
      "file_size": 245678,
      "uploaded_at": "2025-10-24T10:30:00.000Z"
    }
  ]
}
```

**Error Responses:**

400 Bad Request - No file uploaded:
```json
{
  "error": "No file uploaded"
}
```

403 Forbidden - User not authorized:
```json
{
  "error": "User is not a member of this chat"
}
```

500 Internal Server Error - Unsupported file type:
```json
{
  "error": "File type application/exe is not supported"
}
```

### Access Uploaded Files

**Endpoint:** `GET /uploads/{filename}`

**Authentication:** Not required (public access)

**Example:**
```
http://localhost:3001/uploads/image-1729765800000-123456789.jpg
```

**Note:** File URLs are returned in the `file_url` field of attachment objects.

### Testing File Upload

A test page is available at `http://localhost:3001/test-upload.html` for easy testing of file upload functionality.

**Quick Start:**
1. Open `http://localhost:3001/test-upload.html`
2. Enter your JWT token, chat ID, and sender ID
3. Select a file to upload
4. Click "Upload File"
5. View results and uploaded messages

For detailed documentation, see:
- `FILE_UPLOAD_GUIDE.md` - Complete usage guide
- `QUICK_START_UPLOAD.md` - Quick testing guide
- `IMPLEMENTATION_SUMMARY.md` - Technical details

---

## Socket.IO Events

### Connection

**Client Event:** `connection`

**Authentication:**
```javascript
const socket = io('http://localhost:3001', {
  auth: {
    token: 'YOUR_ACCESS_TOKEN'
  }
});
```

**Server Response:**
```javascript
socket.on('connected', (data) => {
  console.log(data);
  // {
  //   message: 'Successfully connected',
  //   user: { user_id: 1, username: 'johndoe', ... },
  //   chats: [...]
  // }
});
```

---

### Send Message

**Client Event:** `send_message`

**Payload:**
```javascript
socket.emit('send_message', {
  chat_id: 5,
  message_text: 'Hello via Socket.IO!',
  message_type: 'text'
});
```

**Server Responses:**

1. To all chat members (`new_message`):
```javascript
socket.on('new_message', (message) => {
  console.log(message);
  // {
  //   message_id: 30,
  //   chat_id: 5,
  //   sender_id: 1,
  //   message_text: 'Hello via Socket.IO!',
  //   message_type: 'text',
  //   created_at: '2024-01-15T14:00:00.000Z',
  //   sender: { user_id: 1, username: 'johndoe', ... },
  //   chat: { chat_id: 5, chat_name: 'Project Team', ... }
  // }
});
```

2. To sender (`message_sent`):
```javascript
socket.on('message_sent', (confirmation) => {
  console.log(confirmation);
  // {
  //   message_id: 30,
  //   status: 'sent',
  //   timestamp: '2024-01-15T14:00:00.000Z'
  // }
});
```

---

### Typing Indicators

**Start Typing:**
```javascript
socket.emit('typing_start', {
  chat_id: 5,
  user_id: 1,
  username: 'johndoe'
});
```

**Stop Typing:**
```javascript
socket.emit('typing_stop', {
  chat_id: 5,
  user_id: 1
});
```

**Receive Typing Status:**
```javascript
socket.on('user_typing', (data) => {
  console.log(`${data.username} is typing in chat ${data.chat_id}`);
});

socket.on('user_stopped_typing', (data) => {
  console.log(`User ${data.user_id} stopped typing`);
});
```

---

### Join/Leave Chat

**Join Chat:**
```javascript
socket.emit('join_chat', {
  chat_id: 5,
  user_id: 1
});
```

**Leave Chat:**
```javascript
socket.emit('leave_chat', {
  chat_id: 5,
  user_id: 1
});
```

**Receive Join/Leave Events:**
```javascript
socket.on('chat_joined', (data) => {
  console.log('Joined chat:', data.chat_id);
});

socket.on('user_joined_chat', (data) => {
  console.log(`User ${data.user_id} joined chat ${data.chat_id}`);
});

socket.on('user_left_chat', (data) => {
  console.log(`User ${data.user_id} left chat ${data.chat_id}`);
});
```

---

### User Status

**Update Status:**
```javascript
socket.emit('update_status', {
  user_id: 1,
  status_message: 'Busy coding'
});
```

**Receive Status Updates:**
```javascript
socket.on('user_status_updated', (data) => {
  console.log(`User ${data.user_id} status: ${data.status_message}`);
});
```

---

### Online/Offline Status

**Get Online Users:**
```javascript
socket.emit('get_online_users');

socket.on('online_users', (users) => {
  console.log('Online users:', users);
  // [
  //   { user_id: 1, username: 'johndoe', status: 'online', ... }
  // ]
});
```

**Receive Online/Offline Events:**
```javascript
socket.on('user_online', (user) => {
  console.log(`${user.username} is now online`);
});

socket.on('user_offline', (user) => {
  console.log(`${user.username} went offline`);
  console.log('Last seen:', user.lastSeen);
});
```

---

### Error Handling

```javascript
socket.on('error', (error) => {
  console.error('Socket error:', error.message);
});
```

---

## Error Responses

All APIs follow a consistent error response format:

```json
{
  "error": "Error message describing what went wrong"
}
```

Common HTTP status codes:
- `400`: Bad Request (validation error, missing fields)
- `401`: Unauthorized (invalid or expired token)
- `403`: Forbidden (insufficient permissions)
- `404`: Not Found (resource doesn't exist)
- `409`: Conflict (duplicate username/email)
- `500`: Internal Server Error (server-side error)

---

## Rate Limiting

Currently, there is no rate limiting implemented. Consider adding it in production using packages like `express-rate-limit`.

---

## Testing with Postman

1. Import the API endpoints into Postman
2. Set up environment variables:
   - `BASE_URL`: `http://localhost:3001/api`
   - `ACCESS_TOKEN`: Your JWT access token (obtained after login)
3. Add authorization header to protected routes:
   - Type: Bearer Token
   - Token: `{{ACCESS_TOKEN}}`

---

## Additional Notes

1. **Authentication Flow:**
   - Register → Verify OTP → Login → Verify OTP → Receive Tokens
   - Use access token for API requests
   - Use refresh token to get new access token when expired

2. **Socket.IO Connection:**
   - Must authenticate with JWT token in connection handshake
   - Connection is maintained for real-time messaging
   - Automatically joins user to their chat rooms

3. **Message Status:**
   - `sent`: Message sent by sender
   - `delivered`: Message delivered to recipient
   - `read`: Message read by recipient

4. **Chat Types:**
   - `private`: One-to-one chat (exactly 2 members)
   - `group`: Group chat (2+ members, requires admin)

5. **File Attachments:**
   - Currently stores file URLs
   - Actual file upload implementation needed
   - Supports multiple attachments per message

---

This documentation covers all available APIs in the ConvoHub application. For any questions or issues, please refer to the source code in the respective controller files.