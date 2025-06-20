import { pgTable, text, serial, integer, boolean, timestamp, jsonb, real } from "drizzle-orm/pg-core";
import { createInsertSchema } from "drizzle-zod";
import { z } from "zod";

// User types
export const UserType = {
  WORKER: "worker",
  EMPLOYER: "employer",
  ADMIN: "admin",
} as const;

export type UserTypeValues = typeof UserType[keyof typeof UserType];

// Job status types
export const JobStatus = {
  OPEN: "open",
  IN_PROGRESS: "in_progress",
  COMPLETED: "completed",
  CANCELLED: "cancelled",
} as const;

export type JobStatusValues = typeof JobStatus[keyof typeof JobStatus];

// Application status types
export const ApplicationStatus = {
  PENDING: "pending",
  UNDER_REVIEW: "under_review",
  INTERVIEW: "interview",
  ACCEPTED: "accepted",
  REJECTED: "rejected",
} as const;

export type ApplicationStatusValues = typeof ApplicationStatus[keyof typeof ApplicationStatus];

// Users table
export const users = pgTable("users", {
  id: serial("id").primaryKey(),
  username: text("username").notNull().unique(),
  password: text("password").notNull(),
  email: text("email").notNull().unique(),
  fullName: text("full_name").notNull(),
  phoneNumber: text("phone_number").notNull(),
  userType: text("user_type").notNull().$type<UserTypeValues>(),
  profilePicture: text("profile_picture"),
  bio: text("bio"),
  location: text("location"),
  rating: real("rating").default(0),
  isVerified: boolean("is_verified").default(false),
  createdAt: timestamp("created_at").defaultNow(),
});

// Worker profiles
export const workerProfiles = pgTable("worker_profiles", {
  id: serial("id").primaryKey(),
  userId: integer("user_id").notNull().references(() => users.id),
  skills: text("skills").array(),
  experience: integer("experience"),
  hourlyRate: integer("hourly_rate"),
  availability: jsonb("availability"),
  documents: jsonb("documents"),
});

// Employer profiles
export const employerProfiles = pgTable("employer_profiles", {
  id: serial("id").primaryKey(),
  userId: integer("user_id").notNull().references(() => users.id),
  companyName: text("company_name").notNull(),
  industry: text("industry").notNull(),
  companySize: text("company_size"),
  website: text("website"),
  documents: jsonb("documents"),
});

// Jobs
export const jobs = pgTable("jobs", {
  id: serial("id").primaryKey(),
  employerId: integer("employer_id").notNull().references(() => users.id),
  title: text("title").notNull(),
  description: text("description").notNull(),
  location: text("location").notNull(),
  skills: text("skills").array(),
  hourlyRate: integer("hourly_rate"),
  jobType: text("job_type").notNull(), // full-time, part-time, contract
  status: text("status").notNull().$type<JobStatusValues>().default("open"),
  startDate: timestamp("start_date"),
  endDate: timestamp("end_date"),
  createdAt: timestamp("created_at").defaultNow(),
});

// Job applications
export const applications = pgTable("applications", {
  id: serial("id").primaryKey(),
  jobId: integer("job_id").notNull().references(() => jobs.id),
  workerId: integer("worker_id").notNull().references(() => users.id),
  coverLetter: text("cover_letter"),
  resumeUrl: text("resume_url"),  // Added field for resume URL
  availableToStart: timestamp("available_to_start"),
  expectedRate: integer("expected_rate"),
  preferredHours: text("preferred_hours"),
  referenceInfo: text("reference_info"),
  status: text("status").notNull().$type<ApplicationStatusValues>().default("pending"),
  appliedAt: timestamp("applied_at").defaultNow(),
  updatedAt: timestamp("updated_at").defaultNow(),
});

// Ratings and reviews
export const ratings = pgTable("ratings", {
  id: serial("id").primaryKey(),
  fromUserId: integer("from_user_id").notNull().references(() => users.id),
  toUserId: integer("to_user_id").notNull().references(() => users.id),
  jobId: integer("job_id").references(() => jobs.id),
  rating: integer("rating").notNull(),
  review: text("review"),
  createdAt: timestamp("created_at").defaultNow(),
});

// Messages
export const messages = pgTable("messages", {
  id: serial("id").primaryKey(),
  fromUserId: integer("from_user_id").notNull().references(() => users.id),
  toUserId: integer("to_user_id").notNull().references(() => users.id),
  content: text("content").notNull(),
  isRead: boolean("is_read").default(false),
  createdAt: timestamp("created_at").defaultNow(),
});

// Notifications
export const notifications = pgTable("notifications", {
  id: serial("id").primaryKey(),
  userId: integer("user_id").notNull().references(() => users.id),
  title: text("title").notNull(),
  content: text("content").notNull(),
  type: text("type").notNull(), // job_application, message, system, etc.
  isRead: boolean("is_read").default(false),
  relatedId: integer("related_id"), // job_id, application_id, etc.
  createdAt: timestamp("created_at").defaultNow(),
});

// Define schemas for insertion
export const insertUserSchema = createInsertSchema(users).omit({ 
  id: true,
  rating: true, 
  isVerified: true,
  createdAt: true,
  profilePicture: true
});

export const insertWorkerProfileSchema = createInsertSchema(workerProfiles).omit({
  id: true,
  documents: true
});

export const insertEmployerProfileSchema = createInsertSchema(employerProfiles).omit({
  id: true,
  documents: true
});

export const insertJobSchema = createInsertSchema(jobs).omit({
  id: true,
  createdAt: true
});

export const insertApplicationSchema = createInsertSchema(applications)
  .omit({
    id: true,
    appliedAt: true,
    updatedAt: true
  })
  .extend({
    // Enhance the schema to handle both Date objects and ISO strings for availableToStart
    availableToStart: z.union([z.date(), z.string().datetime()]).optional(),
    // Make resumeUrl optional
    resumeUrl: z.string().optional()
  });

export const insertRatingSchema = createInsertSchema(ratings).omit({
  id: true,
  createdAt: true
});

export const insertMessageSchema = createInsertSchema(messages).omit({
  id: true,
  isRead: true,
  createdAt: true
});

export const insertNotificationSchema = createInsertSchema(notifications).omit({
  id: true,
  isRead: true,
  createdAt: true
});

// Export types for use in the application
export type User = typeof users.$inferSelect;
export type InsertUser = z.infer<typeof insertUserSchema>;

export type WorkerProfile = typeof workerProfiles.$inferSelect;
export type InsertWorkerProfile = z.infer<typeof insertWorkerProfileSchema>;

export type EmployerProfile = typeof employerProfiles.$inferSelect;
export type InsertEmployerProfile = z.infer<typeof insertEmployerProfileSchema>;

export type Job = typeof jobs.$inferSelect;
export type InsertJob = z.infer<typeof insertJobSchema>;

export type Application = typeof applications.$inferSelect;
export type InsertApplication = z.infer<typeof insertApplicationSchema>;

export type Rating = typeof ratings.$inferSelect;
export type InsertRating = z.infer<typeof insertRatingSchema>;

export type Message = typeof messages.$inferSelect;
export type InsertMessage = z.infer<typeof insertMessageSchema>;

export type Notification = typeof notifications.$inferSelect;
export type InsertNotification = z.infer<typeof insertNotificationSchema>;

// Authentication-related schemas
export const registerSchema = z.object({
  username: z.string().min(3).max(50),
  password: z.string().min(6).max(100),
  email: z.string().email(),
  fullName: z.string().min(2).max(100),
  phoneNumber: z.string().min(10).max(15),
  userType: z.enum([UserType.WORKER, UserType.EMPLOYER]),
  // Conditionally required fields
  skills: z.array(z.string()).optional(),
  experience: z.number().optional(),
  companyName: z.string().optional(),
  industry: z.string().optional(),
});

export const loginSchema = z.object({
  username: z.string(),
  password: z.string(),
});

export type RegisterData = z.infer<typeof registerSchema>;
export type LoginData = z.infer<typeof loginSchema>;
