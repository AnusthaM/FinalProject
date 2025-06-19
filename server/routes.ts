import type { Express } from "express";
import { createServer, type Server } from "http";
import { setupAuth } from "./auth";
import { storage } from "./storage";
import { z } from "zod";
import {
  insertJobSchema,
  insertApplicationSchema,
  insertRatingSchema,
  insertMessageSchema,
  insertEmployerProfileSchema,
  insertWorkerProfileSchema,
  jobs,
  applications,
  JobStatus,
  ApplicationStatus,
} from "@shared/schema";

import { WebSocketServer, WebSocket } from 'ws';

// Track active WebSocket connections by user ID
const activeConnections = new Map<number, WebSocket[]>();

export async function registerRoutes(app: Express): Promise<Server> {
  // Set up authentication routes
  setupAuth(app);

  // API Routes (prefix all routes with /api)

  // Jobs
  app.get("/api/jobs", async (req, res) => {
    try {
      const allJobs = await storage.getAllJobs();
      res.json(allJobs);
    } catch (error) {
      res.status(500).json({ message: "Failed to retrieve jobs" });
    }
  });

  // Get jobs for a specific employer
  app.get("/api/jobs/employer", async (req, res) => {
    if (!req.isAuthenticated()) return res.status(401).json({ message: "Unauthorized" });
    if (req.user.userType !== "employer") return res.status(403).json({ message: "Only employers can access their jobs" });

    try {
      const jobs = await storage.getEmployerJobs(req.user.id);
      res.json(jobs);
    } catch (error) {
      res.status(500).json({ message: "Failed to retrieve employer jobs" });
    }
  });

  // Fetch jobs matched for a specific worker based on their skills and preferences
  app.get("/api/jobs/match/:workerId", async (req, res) => {
    try {
      const workerId = parseInt(req.params.workerId);
      const matchedJobs = await storage.getMatchedJobsForWorker(workerId);
      res.json(matchedJobs);
    } catch (error) {
      res.status(500).json({ message: "Failed to retrieve matched jobs" });
    }
  });

  app.get("/api/jobs/:id", async (req, res) => {
    try {
      const jobId = parseInt(req.params.id);
      const job = await storage.getJob(jobId);
      if (!job) {
        return res.status(404).json({ message: "Job not found" });
      }
      res.json(job);
    } catch (error) {
      res.status(500).json({ message: "Failed to retrieve job" });
    }
  });

  app.post("/api/jobs", async (req, res) => {
    console.log("Job post attempt, authenticated:", req.isAuthenticated());

    if (!req.isAuthenticated()) {
      console.log("Unauthorized job post attempt - no authentication");
      return res.status(401).json({ message: "Unauthorized - Please log in" });
    }

    console.log("User attempting to post job:", req.user.username, "User type:", req.user.userType);

    if (req.user.userType !== "employer") {
      console.log("Non-employer tried to post a job:", req.user.userType);
      return res.status(403).json({ message: "Only employers can post jobs" });
    }

    try {
      console.log("Processing job creation request from employerId:", req.user.id);

      // Handle date conversion if they're strings
      const jobData = { ...req.body, employerId: req.user.id };

      // Convert date strings to Date objects if they exist
      if (jobData.startDate && typeof jobData.startDate === 'string') {
        jobData.startDate = new Date(jobData.startDate);
      }

      if (jobData.endDate && typeof jobData.endDate === 'string') {
        jobData.endDate = new Date(jobData.endDate);
      }

      console.log("Processed job data:", jobData);

      const validatedData = insertJobSchema.parse(jobData);

      console.log("Validated job data:", validatedData);
      const job = await storage.createJob(validatedData);
      console.log("Job created successfully:", job);
      res.status(201).json(job);
    } catch (error) {
      console.error("Error creating job:", error);
      if (error instanceof z.ZodError) {
        return res.status(400).json({ message: "Invalid job data", errors: error.errors });
      }
      res.status(500).json({ message: "Failed to create job", error: String(error) });
    }
  });

  app.put("/api/jobs/:id", async (req, res) => {
    if (!req.isAuthenticated()) return res.status(401).json({ message: "Unauthorized" });

    try {
      const jobId = parseInt(req.params.id);
      const job = await storage.getJob(jobId);

      if (!job) {
        return res.status(404).json({ message: "Job not found" });
      }

      if (job.employerId !== req.user.id) {
        return res.status(403).json({ message: "You can only update your own jobs" });
      }

      const updatedJob = await storage.updateJob(jobId, req.body);
      res.json(updatedJob);
    } catch (error) {
      res.status(500).json({ message: "Failed to update job" });
    }
  });

  app.delete("/api/jobs/:id", async (req, res) => {
    if (!req.isAuthenticated()) return res.status(401).json({ message: "Unauthorized" });

    try {
      const jobId = parseInt(req.params.id);
      const job = await storage.getJob(jobId);

      if (!job) {
        return res.status(404).json({ message: "Job not found" });
      }

      if (job.employerId !== req.user.id) {
        return res.status(403).json({ message: "You can only delete your own jobs" });
      }

      await storage.deleteJob(jobId);
      res.status(204).send();
    } catch (error) {
      res.status(500).json({ message: "Failed to delete job" });
    }
  });

  // Job Applications
  app.get("/api/applications", async (req, res) => {
    if (!req.isAuthenticated()) return res.status(401).json({ message: "Unauthorized" });

    try {
      let applications;
      console.log(`User type: ${req.user.userType}, User ID: ${req.user.id}`);

      if (req.user.userType === "worker") {
        console.log("Getting applications for worker:", req.user.id);
        applications = await storage.getWorkerApplications(req.user.id);
        console.log(`Found ${applications.length} applications for worker`);

        // Enhance applications with job details
        const enhancedApplications = await Promise.all(
          applications.map(async (app) => {
            const job = await storage.getJob(app.jobId);
            if (job) {
              // Get employer details
              const employer = await storage.getUser(job.employerId);

              return {
                ...app,
                jobTitle: job.title,
                companyName: employer?.fullName || "Company Name",
                location: job.location || "Unknown Location",
                hourlyRate: job.hourlyRate || app.expectedRate || 0,
                employerId: job.employerId // Add employer ID for messaging
              };
            }
            return app;
          })
        );

        console.log("Sending enhanced applications for worker:", enhancedApplications.length);
        res.json(enhancedApplications);
      } else if (req.user.userType === "employer") {
        console.log("Getting applications for employer:", req.user.id);
        applications = await storage.getEmployerApplications(req.user.id);
        console.log(`Found ${applications.length} applications for employer`, applications);

        // Enhance applications with job and worker details for employers too
        const enhancedApplications = await Promise.all(
          applications.map(async (app) => {
            console.log(`Processing application id: ${app.id} for job: ${app.jobId} by worker: ${app.workerId}`);

            const job = await storage.getJob(app.jobId);
            console.log(`Job data:`, job ? `Found job ${job.id}` : "No job found");

            const worker = await storage.getUser(app.workerId);
            console.log(`Worker data:`, worker ? `Found worker ${worker.id}` : "No worker found");

            return {
              ...app,
              job: job || undefined,
              worker: worker ? {
                id: worker.id,
                username: worker.username,
                fullName: worker.fullName,
                profilePicture: worker.profilePicture
              } : undefined
            };
          })
        );

        console.log("Sending enhanced applications for employer:", enhancedApplications.length);
        res.json(enhancedApplications);
      } else {
        return res.status(403).json({ message: "Invalid user type" });
      }
    } catch (error) {
      console.error("Error retrieving applications:", error);
      res.status(500).json({ message: "Failed to retrieve applications" });
    }
  });

  app.post("/api/applications", async (req, res) => {
    if (!req.isAuthenticated()) return res.status(401).json({ message: "Unauthorized" });
    if (req.user.userType !== "worker") return res.status(403).json({ message: "Only workers can apply for jobs" });

    try {
      // Extract resumeUrl from request body
      const { resumeUrl, ...otherData } = req.body;

      const validatedData = insertApplicationSchema.parse({
        ...otherData,
        workerId: req.user.id
      });

      // Check if job exists and is accepting applications (open or in progress)
      const job = await storage.getJob(validatedData.jobId);
      if (!job) {
        return res.status(404).json({ message: "Job not found" });
      }
      if (job.status !== JobStatus.OPEN && job.status !== JobStatus.IN_PROGRESS) {
        return res.status(400).json({ message: "This job is not accepting applications" });
      }

      // Check if worker already applied
      const existingApplication = await storage.getApplicationByJobAndWorker(validatedData.jobId, req.user.id);
      if (existingApplication) {
        return res.status(400).json({ message: "You have already applied for this job" });
      }

      // Add resumeUrl to application data if provided
      const applicationData = resumeUrl
        ? { ...validatedData, resumeUrl }
        : validatedData;

      const application = await storage.createApplication(applicationData);
      res.status(201).json(application);
    } catch (error) {
      if (error instanceof z.ZodError) {
        return res.status(400).json({ message: "Invalid application data", errors: error.errors });
      }
      res.status(500).json({ message: "Failed to create application" });
    }
  });

  app.put("/api/applications/:id", async (req, res) => {
    if (!req.isAuthenticated()) return res.status(401).json({ message: "Unauthorized" });

    try {
      const applicationId = parseInt(req.params.id);
      const application = await storage.getApplication(applicationId);

      if (!application) {
        return res.status(404).json({ message: "Application not found" });
      }

      // Employers can update status, workers can update their application
      if (req.user.userType === "employer") {
        const job = await storage.getJob(application.jobId);
        if (job?.employerId !== req.user.id) {
          return res.status(403).json({ message: "You can only update applications for your own jobs" });
        }
      } else if (req.user.userType === "worker") {
        if (application.workerId !== req.user.id) {
          return res.status(403).json({ message: "You can only update your own applications" });
        }
        // Workers can only update certain fields
        const allowedFields = ["coverLetter"];
        const invalidFields = Object.keys(req.body).filter(field => !allowedFields.includes(field));
        if (invalidFields.length > 0) {
          return res.status(403).json({ message: `Workers cannot update these fields: ${invalidFields.join(", ")}` });
        }
      }

      const updatedApplication = await storage.updateApplication(applicationId, req.body);
      res.json(updatedApplication);
    } catch (error) {
      res.status(500).json({ message: "Failed to update application" });
    }
  });

  // Ratings
  app.post("/api/ratings", async (req, res) => {
    if (!req.isAuthenticated()) return res.status(401).json({ message: "Unauthorized" });

    try {
      const validatedData = insertRatingSchema.parse({
        ...req.body,
        fromUserId: req.user.id
      });

      // Validate rating is between 1-5
      if (validatedData.rating < 1 || validatedData.rating > 5) {
        return res.status(400).json({ message: "Rating must be between 1 and 5" });
      }

      // Check if job exists and is completed (if jobId is provided)
      if (validatedData.jobId) {
        const job = await storage.getJob(validatedData.jobId);
        if (!job) {
          return res.status(404).json({ message: "Job not found" });
        }
        if (job.status !== JobStatus.COMPLETED) {
          return res.status(400).json({ message: "Rating can only be given for completed jobs" });
        }

        // Verify user was part of this job
        if (req.user.userType === "worker" && job.employerId !== validatedData.toUserId) {
          return res.status(403).json({ message: "You can only rate employers you worked for" });
        }
        if (req.user.userType === "employer" && job.employerId !== req.user.id) {
          return res.status(403).json({ message: "You can only rate workers for your own jobs" });
        }
      }

      const rating = await storage.createRating(validatedData);

      // Update user's average rating
      await storage.updateUserRating(validatedData.toUserId);

      res.status(201).json(rating);
    } catch (error) {
      if (error instanceof z.ZodError) {
        return res.status(400).json({ message: "Invalid rating data", errors: error.errors });
      }
      res.status(500).json({ message: "Failed to create rating" });
    }
  });

  // Messages
  app.get("/api/messages", async (req, res) => {
    if (!req.isAuthenticated()) return res.status(401).json({ message: "Unauthorized" });

    try {
      const otherUserId = req.query.userId ? parseInt(req.query.userId as string) : undefined;

      if (otherUserId) {
        // Get messages between current user and the specified user
        const conversation = await storage.getConversation(req.user.id, otherUserId);
        res.json(conversation);
      } else {
        // Get all messages for current user
        const messages = await storage.getUserMessages(req.user.id);
        res.json(messages);
      }
    } catch (error) {
      console.error("Error retrieving messages:", error);
      res.status(500).json({ message: "Failed to retrieve messages" });
    }
  });

  app.post("/api/messages", async (req, res) => {
    if (!req.isAuthenticated()) return res.status(401).json({ message: "Unauthorized" });

    try {
      const validatedData = insertMessageSchema.parse({
        ...req.body,
        fromUserId: req.user.id
      });

      const message = await storage.createMessage(validatedData);

      // Create notification for recipient
      await storage.createNotification({
        userId: validatedData.toUserId,
        title: "New Message",
        content: `You have a new message from ${req.user.fullName}`,
        type: "message",
        relatedId: message.id
      });

      // Notify recipient via WebSocket if they're online
      const notification = {
        type: "new_message",
        messageId: message.id,
        fromUserId: req.user.id,
        fromName: req.user.fullName
      };

      app.locals.notifyUser(validatedData.toUserId, notification);

      res.status(201).json(message);
    } catch (error) {
      console.error("Error sending message:", error);
      if (error instanceof z.ZodError) {
        return res.status(400).json({ message: "Invalid message data", errors: error.errors });
      }
      res.status(500).json({ message: "Failed to send message" });
    }
  });

  app.put("/api/messages/:id/read", async (req, res) => {
    if (!req.isAuthenticated()) return res.status(401).json({ message: "Unauthorized" });

    try {
      const messageId = parseInt(req.params.id);
      const updatedMessage = await storage.markMessageAsRead(messageId);

      if (!updatedMessage) {
        return res.status(404).json({ message: "Message not found" });
      }

      res.json(updatedMessage);
    } catch (error) {
      console.error("Error marking message as read:", error);
      res.status(500).json({ message: "Failed to mark message as read" });
    }
  });

  // Notifications
  app.get("/api/notifications", async (req, res) => {
    if (!req.isAuthenticated()) return res.status(401).json({ message: "Unauthorized" });

    try {
      const notifications = await storage.getUserNotifications(req.user.id);
      res.json(notifications);
    } catch (error) {
      console.error("Error retrieving notifications:", error);
      res.status(500).json({ message: "Failed to retrieve notifications" });
    }
  });

  app.put("/api/notifications/:id/read", async (req, res) => {
    if (!req.isAuthenticated()) return res.status(401).json({ message: "Unauthorized" });

    try {
      const notificationId = parseInt(req.params.id);
      const updatedNotification = await storage.markNotificationAsRead(notificationId);

      if (!updatedNotification) {
        return res.status(404).json({ message: "Notification not found" });
      }

      res.json(updatedNotification);
    } catch (error) {
      console.error("Error marking notification as read:", error);
      res.status(500).json({ message: "Failed to mark notification as read" });
    }
  });

  // User profiles
  app.get("/api/workers", async (req, res) => {
    try {
      const workers = await storage.getWorkers();
      res.json(workers);
    } catch (error) {
      res.status(500).json({ message: "Failed to retrieve workers" });
    }
  });

  app.get("/api/workers/:id", async (req, res) => {
    try {
      const workerId = parseInt(req.params.id);
      const worker = await storage.getWorkerWithProfile(workerId);
      if (!worker) {
        return res.status(404).json({ message: "Worker not found" });
      }
      res.json(worker);
    } catch (error) {
      res.status(500).json({ message: "Failed to retrieve worker" });
    }
  });

  app.get("/api/employers/:id", async (req, res) => {
    try {
      const employerId = parseInt(req.params.id);
      const employer = await storage.getEmployerWithProfile(employerId);
      if (!employer) {
        return res.status(404).json({ message: "Employer not found" });
      }
      res.json(employer);
    } catch (error) {
      res.status(500).json({ message: "Failed to retrieve employer" });
    }
  });

  // Employer Profile
  app.get("/api/employer-profile", async (req, res) => {
    if (!req.isAuthenticated()) return res.status(401).json({ message: "Unauthorized" });
    if (req.user.userType !== "employer") return res.status(403).json({ message: "Access denied" });

    try {
      const profile = await storage.getEmployerProfile(req.user.id);
      if (!profile) {
        return res.status(404).json({ message: "Profile not found" });
      }
      res.json(profile);
    } catch (error) {
      res.status(500).json({ message: "Failed to retrieve employer profile" });
    }
  });

  app.post("/api/employer-profile", async (req, res) => {
    if (!req.isAuthenticated()) return res.status(401).json({ message: "Unauthorized" });
    if (req.user.userType !== "employer") return res.status(403).json({ message: "Access denied" });

    try {
      // Check if employer already has a profile
      const existingProfile = await storage.getEmployerProfile(req.user.id);
      if (existingProfile) {
        return res.status(400).json({ message: "Profile already exists. Use PUT to update." });
      }

      const validatedData = insertEmployerProfileSchema.parse({
        ...req.body,
        userId: req.user.id
      });

      const profile = await storage.createEmployerProfile(validatedData);
      res.status(201).json(profile);
    } catch (error) {
      if (error instanceof z.ZodError) {
        return res.status(400).json({ message: "Invalid profile data", errors: error.errors });
      }
      res.status(500).json({ message: "Failed to create employer profile" });
    }
  });

  app.put("/api/employer-profile", async (req, res) => {
    if (!req.isAuthenticated()) return res.status(401).json({ message: "Unauthorized" });
    if (req.user.userType !== "employer") return res.status(403).json({ message: "Access denied" });

    try {
      const profile = await storage.getEmployerProfile(req.user.id);
      if (!profile) {
        return res.status(404).json({ message: "Profile not found. Create a profile first." });
      }

      const updatedProfile = await storage.updateEmployerProfile(req.user.id, req.body);
      res.json(updatedProfile);
    } catch (error) {
      if (error instanceof z.ZodError) {
        return res.status(400).json({ message: "Invalid profile data", errors: error.errors });
      }
      res.status(500).json({ message: "Failed to update employer profile" });
    }
  });

  // Worker Profile
  app.get("/api/worker-profile", async (req, res) => {
    if (!req.isAuthenticated()) return res.status(401).json({ message: "Unauthorized" });
    if (req.user.userType !== "worker") return res.status(403).json({ message: "Access denied" });

    try {
      const profile = await storage.getWorkerProfile(req.user.id);
      if (!profile) {
        return res.status(404).json({ message: "Profile not found" });
      }
      res.json(profile);
    } catch (error) {
      res.status(500).json({ message: "Failed to retrieve worker profile" });
    }
  });

  app.post("/api/worker-profile", async (req, res) => {
    if (!req.isAuthenticated()) return res.status(401).json({ message: "Unauthorized" });
    if (req.user.userType !== "worker") return res.status(403).json({ message: "Access denied" });

    try {
      // Check if worker already has a profile
      const existingProfile = await storage.getWorkerProfile(req.user.id);
      if (existingProfile) {
        return res.status(400).json({ message: "Profile already exists. Use PUT to update." });
      }

      const validatedData = insertWorkerProfileSchema.parse({
        ...req.body,
        userId: req.user.id
      });

      const profile = await storage.createWorkerProfile(validatedData);
      res.status(201).json(profile);
    } catch (error) {
      if (error instanceof z.ZodError) {
        return res.status(400).json({ message: "Invalid profile data", errors: error.errors });
      }
      res.status(500).json({ message: "Failed to create worker profile" });
    }
  });

  app.put("/api/worker-profile", async (req, res) => {
    if (!req.isAuthenticated()) return res.status(401).json({ message: "Unauthorized" });
    if (req.user.userType !== "worker") return res.status(403).json({ message: "Access denied" });

    try {
      const profile = await storage.getWorkerProfile(req.user.id);
      if (!profile) {
        return res.status(404).json({ message: "Profile not found. Create a profile first." });
      }

      const updatedProfile = await storage.updateWorkerProfile(req.user.id, req.body);
      res.json(updatedProfile);
    } catch (error) {
      if (error instanceof z.ZodError) {
        return res.status(400).json({ message: "Invalid profile data", errors: error.errors });
      }
      res.status(500).json({ message: "Failed to update worker profile" });
    }
  });

  // Job matching
  app.get("/api/jobs/match/:workerId", async (req, res) => {
    try {
      const workerId = parseInt(req.params.workerId);
      const worker = await storage.getWorkerWithProfile(workerId);
      if (!worker) {
        return res.status(404).json({ message: "Worker not found" });
      }

      // Get matched jobs for this worker
      const matchedJobs = await storage.getMatchedJobsForWorker(workerId);
      res.json(matchedJobs);
    } catch (error) {
      res.status(500).json({ message: "Failed to retrieve matched jobs" });
    }
  });

  // Create HTTP server
  const httpServer = createServer(app);

  // Set up WebSocket server
  const wss = new WebSocketServer({
    server: httpServer,
    path: '/ws'
  });

  // WebSocket connection handler
  wss.on('connection', (ws) => {
    console.log('New WebSocket connection established');
    let userId: number | null = null;

    // Message handler
    ws.on('message', async (message) => {
      try {
        const data = JSON.parse(message.toString());
        console.log('WebSocket message received:', data);

        // Handle authentication message
        if (data.type === 'authenticate') {
          userId = data.userId;
          console.log(`User ${userId} authenticated on WebSocket`);

          // Store the connection
          if (!activeConnections.has(userId)) {
            activeConnections.set(userId, []);
          }
          activeConnections.get(userId)?.push(ws);
        }

        // Handle message sending
        if (data.type === 'message' && userId) {
          // Make sure the user is authenticated
          if (!userId) {
            ws.send(JSON.stringify({ type: 'error', message: 'Not authenticated' }));
            return;
          }

          // Create the message in the database
          if (data.toUserId && data.content) {
            const message = await storage.createMessage({
              fromUserId: userId,
              toUserId: data.toUserId,
              content: data.content
            });

            // Create notification for the recipient
            await storage.createNotification({
              userId: data.toUserId,
              title: 'New Message',
              content: `You have a new message from ${data.fromUsername || 'another user'}`,
              type: 'message',
              relatedId: message.id
            });

            // Notify sender of success
            ws.send(JSON.stringify({ type: 'message_sent', messageId: message.id }));

            // Notify recipient if they are online
            const recipientConnections = activeConnections.get(data.toUserId);
            if (recipientConnections && recipientConnections.length > 0) {
              const messageNotification = JSON.stringify({
                type: 'new_message',
                fromUserId: userId,
                messageId: message.id
              });

              recipientConnections.forEach(conn => {
                if (conn.readyState === WebSocket.OPEN) {
                  conn.send(messageNotification);
                }
              });
            }
          }
        }
      } catch (error) {
        console.error('Error handling WebSocket message:', error);
      }
    });

    // Close handler
    ws.on('close', () => {
      console.log(`WebSocket connection closed ${userId ? `for user ${userId}` : ''}`);
      if (userId) {
        const userConnections = activeConnections.get(userId);
        if (userConnections) {
          const index = userConnections.indexOf(ws);
          if (index !== -1) {
            userConnections.splice(index, 1);
          }
          if (userConnections.length === 0) {
            activeConnections.delete(userId);
          }
        }
      }
    });
  });

  // Add WebSocket notification helper function
  app.locals.notifyUser = (userId: number, notification: any) => {
    const userConnections = activeConnections.get(userId);
    if (userConnections && userConnections.length > 0) {
      const message = JSON.stringify(notification);
      userConnections.forEach(conn => {
        if (conn.readyState === WebSocket.OPEN) {
          conn.send(message);
        }
      });
      return true;
    }
    return false;
  };

  return httpServer;
}
