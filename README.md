# Note-Taking API

## Run

Set `MONGODB_URI` and a strong `JWT_SECRET` in `API/.env`, then run:

```powershell
npm run dev
npm test
```

The API listens on port `5000` by default; set `PORT` to change it.

## Authentication

- `POST /api/auth/register` — create a regular user
- `POST /api/auth/login` — receive a JWT
- `GET /api/auth/me` — current authenticated user

Send the login token on protected routes as `Authorization: Bearer <token>`.
Public registration ignores any submitted role; it cannot create an admin.

## Notes

All note routes require a JWT.

- `POST /api/notes` — create a note (`title`, `content`)
- `GET /api/notes?page=1&limit=10` — list the caller's notes; admins can view all notes
- `GET /api/notes/:noteId` — read a note; admins can view any note
- `PATCH /api/notes/:noteId` — update an owned note
- `DELETE /api/notes/:noteId` — delete an owned note

Admins can read everyone’s notes, but can update or delete only their own notes.

## Admin user management and interest aggregation

All routes below require an admin JWT.

- `POST /api/admin/users` — create a user; optional `role` can be `user` or `admin`
- `GET /api/admin/users?page=1&limit=10` — paginated user list
- `GET /api/admin/users/grouped-by-interests?page=1&limit=10` — users grouped by interest
- `PATCH /api/admin/users/:userId` — update user fields, including role
- `DELETE /api/admin/users/:userId` — remove user and their notes/posts

To bootstrap the first admin, register an account and promote it once directly in
MongoDB, for example:

```javascript
db.users.updateOne(
  { email: "admin@example.com" },
  { $set: { role: "admin" } }
)
```

The interest endpoint runs one `User.aggregate()` pipeline. It paginates groups
and returns each group as `{ _id, users, userCount }`.

## Posts and `$lookup`

- `POST /api/posts` — authenticated user creates a public post (`title`, `content`)
- `GET /api/posts/by-user/:userId?page=1&limit=10` — public, paginated posts for a user

The user-post endpoint uses one `User.aggregate()` pipeline with a `$lookup` to
the posts collection. It returns the user, posts, and pagination metadata.

## Indexes

Indexes are declared with `schema.index()` and match the query shapes:

- Users: unique `email` for login/duplicate prevention; `createdAt, _id` for
  paginated admin listing; `interests` for interest-based queries.
- Notes: `owner, createdAt, _id` for a user's list; `createdAt, _id` for the
  admin-wide note list. Single-record reads use MongoDB's built-in `_id` index.
- Posts: `author, createdAt, _id` for the `$lookup` by author and sorted,
  paginated post results.
