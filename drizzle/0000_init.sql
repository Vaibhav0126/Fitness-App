CREATE TYPE "public"."import_status" AS ENUM('pending', 'running', 'done', 'failed');--> statement-breakpoint
CREATE TYPE "public"."interval_kind" AS ENUM('warmup', 'run', 'walk', 'cooldown');--> statement-breakpoint
CREATE TYPE "public"."metric_name" AS ENUM('sleep_hours', 'hrv_sdnn_ms', 'resting_hr', 'steps', 'active_energy_kcal', 'vo2max', 'weight_kg', 'walking_hr_avg');--> statement-breakpoint
CREATE TYPE "public"."units" AS ENUM('metric', 'imperial');--> statement-breakpoint
CREATE TYPE "public"."workout_type" AS ENUM('run', 'walk', 'ride', 'strength', 'other');--> statement-breakpoint
CREATE TABLE "account" (
	"id" text PRIMARY KEY NOT NULL,
	"account_id" text NOT NULL,
	"provider_id" text NOT NULL,
	"user_id" text NOT NULL,
	"access_token" text,
	"refresh_token" text,
	"id_token" text,
	"access_token_expires_at" timestamp with time zone,
	"refresh_token_expires_at" timestamp with time zone,
	"scope" text,
	"password" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone NOT NULL
);
--> statement-breakpoint
CREATE TABLE "rate_limit" (
	"id" text PRIMARY KEY NOT NULL,
	"key" text NOT NULL,
	"count" integer NOT NULL,
	"last_request" bigint NOT NULL,
	CONSTRAINT "rate_limit_key_unique" UNIQUE("key")
);
--> statement-breakpoint
CREATE TABLE "session" (
	"id" text PRIMARY KEY NOT NULL,
	"expires_at" timestamp with time zone NOT NULL,
	"token" text NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone NOT NULL,
	"ip_address" text,
	"user_agent" text,
	"user_id" text NOT NULL,
	CONSTRAINT "session_token_unique" UNIQUE("token")
);
--> statement-breakpoint
CREATE TABLE "user" (
	"id" text PRIMARY KEY NOT NULL,
	"name" text NOT NULL,
	"email" text NOT NULL,
	"email_verified" boolean DEFAULT false NOT NULL,
	"image" text,
	"is_demo" boolean DEFAULT false,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "user_email_unique" UNIQUE("email")
);
--> statement-breakpoint
CREATE TABLE "verification" (
	"id" text PRIMARY KEY NOT NULL,
	"identifier" text NOT NULL,
	"value" text NOT NULL,
	"expires_at" timestamp with time zone NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "connection" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"user_id" text NOT NULL,
	"provider" text NOT NULL,
	"access_token_enc" text,
	"refresh_token_enc" text,
	"api_key_enc" text,
	"credential_last_four" text,
	"expires_at" timestamp with time zone,
	"external_athlete_id" text,
	"last_sync_at" timestamp with time zone,
	"sync_cursor" text,
	"status" text DEFAULT 'active' NOT NULL,
	"last_error" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "connection_userId_provider_unique" UNIQUE("user_id","provider")
);
--> statement-breakpoint
CREATE TABLE "daily_metric" (
	"user_id" text NOT NULL,
	"date" date NOT NULL,
	"name" "metric_name" NOT NULL,
	"value" double precision NOT NULL,
	"source" text NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "daily_metric_user_id_date_name_source_pk" PRIMARY KEY("user_id","date","name","source")
);
--> statement-breakpoint
CREATE TABLE "exercise_alias" (
	"id" serial PRIMARY KEY NOT NULL,
	"user_id" text,
	"raw_key" text NOT NULL,
	"canonical" text NOT NULL,
	"muscle_group" text,
	"is_dumbbell" boolean DEFAULT false NOT NULL,
	"is_bodyweight" boolean DEFAULT false NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "exercise_alias_userId_rawKey_unique" UNIQUE NULLS NOT DISTINCT("user_id","raw_key")
);
--> statement-breakpoint
CREATE TABLE "import_job" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"user_id" text NOT NULL,
	"kind" text NOT NULL,
	"status" "import_status" DEFAULT 'pending' NOT NULL,
	"counts" jsonb DEFAULT '{}'::jsonb NOT NULL,
	"error" text,
	"started_at" timestamp with time zone DEFAULT now() NOT NULL,
	"finished_at" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "run_feedback" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"user_id" text NOT NULL,
	"workout_id" uuid,
	"date" date NOT NULL,
	"shin_pain" smallint,
	"calf_pain" smallint,
	"effort" smallint,
	"note" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "strength_set" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"user_id" text NOT NULL,
	"workout_id" uuid,
	"source" text NOT NULL,
	"external_id" text NOT NULL,
	"session_title" text,
	"performed_at" timestamp with time zone NOT NULL,
	"exercise" text NOT NULL,
	"exercise_raw" text NOT NULL,
	"set_index" smallint NOT NULL,
	"set_type" text DEFAULT 'normal' NOT NULL,
	"weight_kg" double precision,
	"reps" smallint,
	"rpe" double precision,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "strength_set_userId_source_externalId_unique" UNIQUE("user_id","source","external_id")
);
--> statement-breakpoint
CREATE TABLE "upload_token" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"user_id" text NOT NULL,
	"name" text NOT NULL,
	"token_hash" text NOT NULL,
	"last_four" text NOT NULL,
	"last_used_at" timestamp with time zone,
	"revoked_at" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "upload_token_tokenHash_unique" UNIQUE("token_hash")
);
--> statement-breakpoint
CREATE TABLE "user_settings" (
	"user_id" text PRIMARY KEY NOT NULL,
	"time_zone" text DEFAULT 'UTC' NOT NULL,
	"units" "units" DEFAULT 'metric' NOT NULL,
	"config" jsonb NOT NULL,
	"onboarding_done" boolean DEFAULT false NOT NULL,
	"data_version" integer DEFAULT 0 NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "workout" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"user_id" text NOT NULL,
	"source" text NOT NULL,
	"external_id" text NOT NULL,
	"type" "workout_type" NOT NULL,
	"start" timestamp with time zone NOT NULL,
	"end" timestamp with time zone,
	"duration_s" integer,
	"distance_m" double precision,
	"avg_hr" double precision,
	"max_hr" double precision,
	"avg_cadence" double precision,
	"avg_speed_kmh" double precision,
	"energy_kcal" double precision,
	"name" text,
	"raw" jsonb,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "workout_userId_source_externalId_unique" UNIQUE("user_id","source","external_id")
);
--> statement-breakpoint
CREATE TABLE "workout_interval" (
	"workout_id" uuid NOT NULL,
	"idx" smallint NOT NULL,
	"kind" interval_kind NOT NULL,
	"start" timestamp with time zone,
	"duration_s" integer,
	"distance_m" double precision,
	"avg_speed_kmh" double precision,
	"avg_hr" double precision,
	"max_hr" double precision,
	"cadence" double precision,
	CONSTRAINT "workout_interval_workout_id_idx_pk" PRIMARY KEY("workout_id","idx")
);
--> statement-breakpoint
ALTER TABLE "account" ADD CONSTRAINT "account_user_id_user_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."user"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "session" ADD CONSTRAINT "session_user_id_user_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."user"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "connection" ADD CONSTRAINT "connection_user_id_user_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."user"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "daily_metric" ADD CONSTRAINT "daily_metric_user_id_user_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."user"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "exercise_alias" ADD CONSTRAINT "exercise_alias_user_id_user_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."user"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "import_job" ADD CONSTRAINT "import_job_user_id_user_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."user"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "run_feedback" ADD CONSTRAINT "run_feedback_user_id_user_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."user"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "run_feedback" ADD CONSTRAINT "run_feedback_workout_id_workout_id_fk" FOREIGN KEY ("workout_id") REFERENCES "public"."workout"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "strength_set" ADD CONSTRAINT "strength_set_user_id_user_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."user"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "strength_set" ADD CONSTRAINT "strength_set_workout_id_workout_id_fk" FOREIGN KEY ("workout_id") REFERENCES "public"."workout"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "upload_token" ADD CONSTRAINT "upload_token_user_id_user_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."user"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "user_settings" ADD CONSTRAINT "user_settings_user_id_user_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."user"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "workout" ADD CONSTRAINT "workout_user_id_user_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."user"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "workout_interval" ADD CONSTRAINT "workout_interval_workout_id_workout_id_fk" FOREIGN KEY ("workout_id") REFERENCES "public"."workout"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "account_user_id_index" ON "account" USING btree ("user_id");--> statement-breakpoint
CREATE INDEX "session_user_id_index" ON "session" USING btree ("user_id");--> statement-breakpoint
CREATE INDEX "verification_identifier_index" ON "verification" USING btree ("identifier");--> statement-breakpoint
CREATE INDEX "daily_metric_user_id_date_index" ON "daily_metric" USING btree ("user_id","date");--> statement-breakpoint
CREATE INDEX "import_job_user_id_started_at_index" ON "import_job" USING btree ("user_id","started_at");--> statement-breakpoint
CREATE UNIQUE INDEX "run_feedback_user_workout_uq" ON "run_feedback" USING btree ("user_id","workout_id") WHERE "run_feedback"."workout_id" is not null;--> statement-breakpoint
CREATE UNIQUE INDEX "run_feedback_user_date_uq" ON "run_feedback" USING btree ("user_id","date") WHERE "run_feedback"."workout_id" is null;--> statement-breakpoint
CREATE INDEX "strength_set_user_id_performed_at_index" ON "strength_set" USING btree ("user_id","performed_at");--> statement-breakpoint
CREATE INDEX "strength_set_user_id_exercise_index" ON "strength_set" USING btree ("user_id","exercise");--> statement-breakpoint
CREATE INDEX "upload_token_user_id_index" ON "upload_token" USING btree ("user_id");--> statement-breakpoint
CREATE INDEX "workout_user_id_start_index" ON "workout" USING btree ("user_id","start");