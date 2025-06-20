# Labor Hire Platform

A comprehensive labor hire platform designed to streamline job matching between workers and employers, featuring robust authentication, job posting, and user management systems with enhanced application and job discovery experiences.

## Tech Stack

- React.js frontend
- TypeScript
- Node.js backend
- PostgreSQL database
- Shadcn UI components
- Zod validation
- Wouter for routing
- TanStack Query for data management
- Resume upload and management functionality
- WebSocket for real-time communication

## Local Development

### Prerequisites

- Node.js 20+
- npm
- PostgreSQL database

### Setup

1. Clone the repository
2. Install dependencies:
   ```
   npm install
   ```
3. Set up environment variables (create a `.env` file in the root directory):
   ```
   DATABASE_URL=postgres://postgres:postgres@localhost:5432/labor_hire
   SESSION_SECRET=your_session_secret
   NODE_ENV=development
   ```
4. Run the database migrations:
   ```
   npm run db:push
   ```
5. Create the session storage table (important for authentication in Docker):
   ```
   psql your_database_name < scripts/create-session-table.sql
   ```
   Or use any PostgreSQL administration tool to run the SQL script at `scripts/create-session-table.sql`.
6. Start the development server:
   ```
   npm run dev
   ```

## Docker Deployment

### Prerequisites

- Docker
- Docker Compose

### Running with Docker Compose

1. Build and start the containers:
   ```
   docker-compose up -d
   ```

   This will:
   - Build the application container
   - Start a PostgreSQL database container
   - Connect the two containers with a Docker network
   - Run database migrations automatically
   - Start the application

2. Access the application at `http://localhost:5000`

3. View logs:
   ```
   docker-compose logs -f
   ```

4. Stop the containers:
   ```
   docker-compose down
   ```

## Features

- User authentication (register, login, logout)
- Dual user roles (workers and employers)
- Profile management
- Job posting and management
- Job application system
- Messaging between workers and employers
- Payment method management
- Real-time notifications
- Dashboard with analytics
- Resume upload and verification

## Database Schema

The application uses PostgreSQL with Drizzle ORM for database operations. The schema includes entities such as:

- Users (workers and employers)
- Worker profiles
- Employer profiles
- Jobs
- Applications
- Ratings
- Messages
- Notifications

## License

MIT License