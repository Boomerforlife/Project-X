// GENERATED FILE - do not edit. Run `npm run gen:types -w @projectx/db` (introspects migrated PGlite).
// Shape follows Supabase generated types. Notes: numeric/bigint are typed `number` and timestamps/dates `string`
// as in Supabase; at runtime our drivers return int8/numeric as strings and timestamptz as Date unless cast in SQL.

export type Json = string | number | boolean | null | { [key: string]: Json | undefined } | Json[];

export type Database = {
  public: {
    Tables: {
      ai_runs: {
        Row: {
          id: string
          task: Database['public']['Enums']['ai_task']
          question_id: string | null
          solution_version_id: string | null
          job_id: string | null
          provider: string
          model: string
          prompt_id: string
          prompt_version: string
          input_hash: string
          status: Database['public']['Enums']['ai_run_status']
          output: Json | null
          error: string | null
          input_tokens: number | null
          output_tokens: number | null
          cost_usd_micros: number
          latency_ms: number | null
          created_at: string
        };
        Insert: {
          id?: string
          task: Database['public']['Enums']['ai_task']
          question_id?: string | null
          solution_version_id?: string | null
          job_id?: string | null
          provider: string
          model: string
          prompt_id: string
          prompt_version: string
          input_hash: string
          status: Database['public']['Enums']['ai_run_status']
          output?: Json | null
          error?: string | null
          input_tokens?: number | null
          output_tokens?: number | null
          cost_usd_micros?: number
          latency_ms?: number | null
          created_at?: string
        };
        Update: {
          id?: string
          task?: Database['public']['Enums']['ai_task']
          question_id?: string | null
          solution_version_id?: string | null
          job_id?: string | null
          provider?: string
          model?: string
          prompt_id?: string
          prompt_version?: string
          input_hash?: string
          status?: Database['public']['Enums']['ai_run_status']
          output?: Json | null
          error?: string | null
          input_tokens?: number | null
          output_tokens?: number | null
          cost_usd_micros?: number
          latency_ms?: number | null
          created_at?: string
        };
        Relationships: [];
      };
      attempts: {
        Row: {
          id: string
          user_id: string
          question_id: string
          session_id: string | null
          client_attempt_id: string
          request_hash: string
          response: Json
          is_correct: boolean
          score: number
          time_spent_ms: number | null
          exam_id: string
          subject_id: string
          chapter_id: string
          topic_id: string | null
          activity_date: string
          submitted_at: string
          created_at: string
        };
        Insert: {
          id?: string
          user_id: string
          question_id: string
          session_id?: string | null
          client_attempt_id: string
          request_hash: string
          response: Json
          is_correct: boolean
          score: number
          time_spent_ms?: number | null
          exam_id: string
          subject_id: string
          chapter_id: string
          topic_id?: string | null
          activity_date: string
          submitted_at?: string
          created_at?: string
        };
        Update: {
          id?: string
          user_id?: string
          question_id?: string
          session_id?: string | null
          client_attempt_id?: string
          request_hash?: string
          response?: Json
          is_correct?: boolean
          score?: number
          time_spent_ms?: number | null
          exam_id?: string
          subject_id?: string
          chapter_id?: string
          topic_id?: string | null
          activity_date?: string
          submitted_at?: string
          created_at?: string
        };
        Relationships: [];
      };
      audit_log: {
        Row: {
          id: number
          actor_id: string | null
          actor_type: string
          action: string
          entity_type: string
          entity_id: string | null
          request_id: string | null
          ip_hash: string | null
          details: Json | null
          created_at: string
        };
        Insert: {
          id?: number
          actor_id?: string | null
          actor_type: string
          action: string
          entity_type: string
          entity_id?: string | null
          request_id?: string | null
          ip_hash?: string | null
          details?: Json | null
          created_at?: string
        };
        Update: {
          id?: number
          actor_id?: string | null
          actor_type?: string
          action?: string
          entity_type?: string
          entity_id?: string | null
          request_id?: string | null
          ip_hash?: string | null
          details?: Json | null
          created_at?: string
        };
        Relationships: [];
      };
      bookmarks: {
        Row: {
          user_id: string
          question_id: string
          note: string | null
          created_at: string
        };
        Insert: {
          user_id: string
          question_id: string
          note?: string | null
          created_at?: string
        };
        Update: {
          user_id?: string
          question_id?: string
          note?: string | null
          created_at?: string
        };
        Relationships: [];
      };
      chapters: {
        Row: {
          id: string
          subject_id: string
          slug: string
          segment: string
          name: string
          unit_number: number | null
          class_level: number | null
          description: string | null
          is_active: boolean
          sort_order: number
          created_at: string
          updated_at: string
        };
        Insert: {
          id?: string
          subject_id: string
          slug: string
          segment: string
          name: string
          unit_number?: number | null
          class_level?: number | null
          description?: string | null
          is_active?: boolean
          sort_order?: number
          created_at?: string
          updated_at?: string
        };
        Update: {
          id?: string
          subject_id?: string
          slug?: string
          segment?: string
          name?: string
          unit_number?: number | null
          class_level?: number | null
          description?: string | null
          is_active?: boolean
          sort_order?: number
          created_at?: string
          updated_at?: string
        };
        Relationships: [];
      };
      daily_activity: {
        Row: {
          user_id: string
          activity_date: string
          attempts_count: number
          correct_count: number
          total_time_ms: number
          first_attempt_at: string
          last_attempt_at: string
        };
        Insert: {
          user_id: string
          activity_date: string
          attempts_count?: number
          correct_count?: number
          total_time_ms?: number
          first_attempt_at: string
          last_attempt_at: string
        };
        Update: {
          user_id?: string
          activity_date?: string
          attempts_count?: number
          correct_count?: number
          total_time_ms?: number
          first_attempt_at?: string
          last_attempt_at?: string
        };
        Relationships: [];
      };
      doubts: {
        Row: {
          id: string
          user_id: string | null
          question_id: string | null
          body: string
          upload_id: string | null
          status: Database['public']['Enums']['doubt_status']
          is_public: boolean
          ip_hash: string | null
          created_at: string
          updated_at: string
        };
        Insert: {
          id?: string
          user_id?: string | null
          question_id?: string | null
          body: string
          upload_id?: string | null
          status?: Database['public']['Enums']['doubt_status']
          is_public?: boolean
          ip_hash?: string | null
          created_at?: string
          updated_at?: string
        };
        Update: {
          id?: string
          user_id?: string | null
          question_id?: string | null
          body?: string
          upload_id?: string | null
          status?: Database['public']['Enums']['doubt_status']
          is_public?: boolean
          ip_hash?: string | null
          created_at?: string
          updated_at?: string
        };
        Relationships: [];
      };
      exam_papers: {
        Row: {
          id: string
          exam_id: string
          slug: string
          title: string
          year: number
          session_label: string | null
          exam_date: string | null
          shift: number | null
          paper_code: string | null
          language: string
          created_at: string
          updated_at: string
        };
        Insert: {
          id?: string
          exam_id: string
          slug: string
          title: string
          year: number
          session_label?: string | null
          exam_date?: string | null
          shift?: number | null
          paper_code?: string | null
          language?: string
          created_at?: string
          updated_at?: string
        };
        Update: {
          id?: string
          exam_id?: string
          slug?: string
          title?: string
          year?: number
          session_label?: string | null
          exam_date?: string | null
          shift?: number | null
          paper_code?: string | null
          language?: string
          created_at?: string
          updated_at?: string
        };
        Relationships: [];
      };
      exams: {
        Row: {
          id: string
          code: string
          slug: string
          name: string
          short_name: string
          description: string | null
          is_active: boolean
          sort_order: number
          created_at: string
          updated_at: string
        };
        Insert: {
          id?: string
          code: string
          slug: string
          name: string
          short_name: string
          description?: string | null
          is_active?: boolean
          sort_order?: number
          created_at?: string
          updated_at?: string
        };
        Update: {
          id?: string
          code?: string
          slug?: string
          name?: string
          short_name?: string
          description?: string | null
          is_active?: boolean
          sort_order?: number
          created_at?: string
          updated_at?: string
        };
        Relationships: [];
      };
      goals: {
        Row: {
          id: string
          user_id: string
          kind: Database['public']['Enums']['goal_kind']
          target_value: number
          chapter_id: string | null
          is_active: boolean
          starts_on: string
          ends_on: string | null
          created_at: string
          updated_at: string
        };
        Insert: {
          id?: string
          user_id: string
          kind: Database['public']['Enums']['goal_kind']
          target_value: number
          chapter_id?: string | null
          is_active?: boolean
          starts_on?: string
          ends_on?: string | null
          created_at?: string
          updated_at?: string
        };
        Update: {
          id?: string
          user_id?: string
          kind?: Database['public']['Enums']['goal_kind']
          target_value?: number
          chapter_id?: string | null
          is_active?: boolean
          starts_on?: string
          ends_on?: string | null
          created_at?: string
          updated_at?: string
        };
        Relationships: [];
      };
      mistakes: {
        Row: {
          user_id: string
          question_id: string
          subject_id: string
          chapter_id: string
          wrong_count: number
          first_wrong_at: string
          last_wrong_at: string
          last_attempt_id: string | null
          resolved_at: string | null
          created_at: string
          updated_at: string
        };
        Insert: {
          user_id: string
          question_id: string
          subject_id: string
          chapter_id: string
          wrong_count?: number
          first_wrong_at: string
          last_wrong_at: string
          last_attempt_id?: string | null
          resolved_at?: string | null
          created_at?: string
          updated_at?: string
        };
        Update: {
          user_id?: string
          question_id?: string
          subject_id?: string
          chapter_id?: string
          wrong_count?: number
          first_wrong_at?: string
          last_wrong_at?: string
          last_attempt_id?: string | null
          resolved_at?: string | null
          created_at?: string
          updated_at?: string
        };
        Relationships: [];
      };
      official_answer_keys: {
        Row: {
          id: string
          source_document_id: string
          paper_id: string
          question_number: string | null
          external_question_id: string | null
          raw_answer: string
          normalized_answer: Json
          is_dropped: boolean
          question_id: string | null
          created_at: string
        };
        Insert: {
          id?: string
          source_document_id: string
          paper_id: string
          question_number?: string | null
          external_question_id?: string | null
          raw_answer: string
          normalized_answer: Json
          is_dropped?: boolean
          question_id?: string | null
          created_at?: string
        };
        Update: {
          id?: string
          source_document_id?: string
          paper_id?: string
          question_number?: string | null
          external_question_id?: string | null
          raw_answer?: string
          normalized_answer?: Json
          is_dropped?: boolean
          question_id?: string | null
          created_at?: string
        };
        Relationships: [];
      };
      pipeline_job_events: {
        Row: {
          id: number
          job_id: string
          level: Database['public']['Enums']['job_event_level']
          stage: string | null
          message: string
          data: Json | null
          created_at: string
        };
        Insert: {
          id?: number
          job_id: string
          level: Database['public']['Enums']['job_event_level']
          stage?: string | null
          message: string
          data?: Json | null
          created_at?: string
        };
        Update: {
          id?: number
          job_id?: string
          level?: Database['public']['Enums']['job_event_level']
          stage?: string | null
          message?: string
          data?: Json | null
          created_at?: string
        };
        Relationships: [];
      };
      pipeline_jobs: {
        Row: {
          id: string
          kind: Database['public']['Enums']['job_kind']
          idempotency_key: string
          status: Database['public']['Enums']['job_status']
          priority: number
          payload: Json
          result: Json | null
          attempts: number
          max_attempts: number
          run_after: string
          locked_by: string | null
          locked_at: string | null
          lease_expires_at: string | null
          last_error: string | null
          source_document_id: string | null
          question_id: string | null
          created_by: string | null
          created_at: string
          updated_at: string
          started_at: string | null
          finished_at: string | null
        };
        Insert: {
          id?: string
          kind: Database['public']['Enums']['job_kind']
          idempotency_key: string
          status?: Database['public']['Enums']['job_status']
          priority?: number
          payload?: Json
          result?: Json | null
          attempts?: number
          max_attempts?: number
          run_after?: string
          locked_by?: string | null
          locked_at?: string | null
          lease_expires_at?: string | null
          last_error?: string | null
          source_document_id?: string | null
          question_id?: string | null
          created_by?: string | null
          created_at?: string
          updated_at?: string
          started_at?: string | null
          finished_at?: string | null
        };
        Update: {
          id?: string
          kind?: Database['public']['Enums']['job_kind']
          idempotency_key?: string
          status?: Database['public']['Enums']['job_status']
          priority?: number
          payload?: Json
          result?: Json | null
          attempts?: number
          max_attempts?: number
          run_after?: string
          locked_by?: string | null
          locked_at?: string | null
          lease_expires_at?: string | null
          last_error?: string | null
          source_document_id?: string | null
          question_id?: string | null
          created_by?: string | null
          created_at?: string
          updated_at?: string
          started_at?: string | null
          finished_at?: string | null
        };
        Relationships: [];
      };
      practice_sessions: {
        Row: {
          id: string
          user_id: string
          client_request_id: string
          mode: Database['public']['Enums']['practice_mode']
          exam_id: string
          subject_id: string | null
          chapter_id: string | null
          topic_id: string | null
          paper_id: string | null
          filters: Json
          question_ids: string[]
          status: Database['public']['Enums']['session_status']
          attempted_count: number
          correct_count: number
          score: number
          started_at: string
          completed_at: string | null
          last_activity_at: string
          created_at: string
          updated_at: string
        };
        Insert: {
          id?: string
          user_id: string
          client_request_id: string
          mode: Database['public']['Enums']['practice_mode']
          exam_id: string
          subject_id?: string | null
          chapter_id?: string | null
          topic_id?: string | null
          paper_id?: string | null
          filters?: Json
          question_ids: string[]
          status?: Database['public']['Enums']['session_status']
          attempted_count?: number
          correct_count?: number
          score?: number
          started_at?: string
          completed_at?: string | null
          last_activity_at?: string
          created_at?: string
          updated_at?: string
        };
        Update: {
          id?: string
          user_id?: string
          client_request_id?: string
          mode?: Database['public']['Enums']['practice_mode']
          exam_id?: string
          subject_id?: string | null
          chapter_id?: string | null
          topic_id?: string | null
          paper_id?: string | null
          filters?: Json
          question_ids?: string[]
          status?: Database['public']['Enums']['session_status']
          attempted_count?: number
          correct_count?: number
          score?: number
          started_at?: string
          completed_at?: string | null
          last_activity_at?: string
          created_at?: string
          updated_at?: string
        };
        Relationships: [];
      };
      profiles: {
        Row: {
          id: string
          display_name: string | null
          timezone: string
          target_exam_id: string | null
          target_year: number | null
          daily_goal_attempts: number
          onboarding_completed_at: string | null
          created_at: string
          updated_at: string
        };
        Insert: {
          id: string
          display_name?: string | null
          timezone?: string
          target_exam_id?: string | null
          target_year?: number | null
          daily_goal_attempts?: number
          onboarding_completed_at?: string | null
          created_at?: string
          updated_at?: string
        };
        Update: {
          id?: string
          display_name?: string | null
          timezone?: string
          target_exam_id?: string | null
          target_year?: number | null
          daily_goal_attempts?: number
          onboarding_completed_at?: string | null
          created_at?: string
          updated_at?: string
        };
        Relationships: [];
      };
      question_assets: {
        Row: {
          id: string
          question_id: string | null
          solution_version_id: string | null
          source_question_id: string | null
          kind: Database['public']['Enums']['asset_kind']
          bucket: Database['public']['Enums']['storage_bucket']
          r2_key: string
          mime_type: string
          width: number | null
          height: number | null
          bytes: number | null
          sha256: string
          alt_text: string | null
          created_at: string
        };
        Insert: {
          id?: string
          question_id?: string | null
          solution_version_id?: string | null
          source_question_id?: string | null
          kind: Database['public']['Enums']['asset_kind']
          bucket: Database['public']['Enums']['storage_bucket']
          r2_key: string
          mime_type: string
          width?: number | null
          height?: number | null
          bytes?: number | null
          sha256: string
          alt_text?: string | null
          created_at?: string
        };
        Update: {
          id?: string
          question_id?: string | null
          solution_version_id?: string | null
          source_question_id?: string | null
          kind?: Database['public']['Enums']['asset_kind']
          bucket?: Database['public']['Enums']['storage_bucket']
          r2_key?: string
          mime_type?: string
          width?: number | null
          height?: number | null
          bytes?: number | null
          sha256?: string
          alt_text?: string | null
          created_at?: string
        };
        Relationships: [];
      };
      question_options: {
        Row: {
          id: string
          question_id: string
          label: string
          sort_order: number
          content: Json
          content_text: string
          external_option_id: string | null
          created_at: string
          updated_at: string
        };
        Insert: {
          id?: string
          question_id: string
          label: string
          sort_order: number
          content: Json
          content_text: string
          external_option_id?: string | null
          created_at?: string
          updated_at?: string
        };
        Update: {
          id?: string
          question_id?: string
          label?: string
          sort_order?: number
          content?: Json
          content_text?: string
          external_option_id?: string | null
          created_at?: string
          updated_at?: string
        };
        Relationships: [];
      };
      questions: {
        Row: {
          id: string
          slug: string
          exam_id: string
          subject_id: string | null
          chapter_id: string | null
          topic_id: string | null
          paper_id: string | null
          origin: Database['public']['Enums']['question_origin']
          question_type: Database['public']['Enums']['question_type']
          marking_scheme: Database['public']['Enums']['marking_scheme']
          difficulty: Database['public']['Enums']['difficulty'] | null
          marks: number
          negative_marks: number
          year: number | null
          shift: number | null
          session_label: string | null
          question_number: string | null
          question_text: string
          structured_content: Json
          answer_key: Json | null
          answer_key_source: Database['public']['Enums']['answer_key_source'] | null
          source_id: string | null
          source_question_id: string | null
          content_hash: string | null
          dedupe_text: string | null
          ingestion_status: Database['public']['Enums']['ingestion_status']
          verification_status: Database['public']['Enums']['verification_status']
          publication_status: Database['public']['Enums']['publication_status']
          indexability: Database['public']['Enums']['indexability']
          sitemap_include: boolean
          access_tier: Database['public']['Enums']['access_tier']
          current_solution_id: string | null
          seo_title: string | null
          seo_description: string | null
          search_tsv: string | null
          is_indexable: boolean | null
          row_version: number
          created_by: string | null
          created_at: string
          updated_at: string
          published_at: string | null
          first_published_at: string | null
          archived_at: string | null
        };
        Insert: {
          id?: string
          slug: string
          exam_id: string
          subject_id?: string | null
          chapter_id?: string | null
          topic_id?: string | null
          paper_id?: string | null
          origin: Database['public']['Enums']['question_origin']
          question_type: Database['public']['Enums']['question_type']
          marking_scheme?: Database['public']['Enums']['marking_scheme']
          difficulty?: Database['public']['Enums']['difficulty'] | null
          marks?: number
          negative_marks?: number
          year?: number | null
          shift?: number | null
          session_label?: string | null
          question_number?: string | null
          question_text: string
          structured_content: Json
          answer_key?: Json | null
          answer_key_source?: Database['public']['Enums']['answer_key_source'] | null
          source_id?: string | null
          source_question_id?: string | null
          content_hash?: string | null
          dedupe_text?: string | null
          ingestion_status?: Database['public']['Enums']['ingestion_status']
          verification_status?: Database['public']['Enums']['verification_status']
          publication_status?: Database['public']['Enums']['publication_status']
          indexability?: Database['public']['Enums']['indexability']
          sitemap_include?: boolean
          access_tier?: Database['public']['Enums']['access_tier']
          current_solution_id?: string | null
          seo_title?: string | null
          seo_description?: string | null
          search_tsv?: string | null
          row_version?: number
          created_by?: string | null
          created_at?: string
          updated_at?: string
          published_at?: string | null
          first_published_at?: string | null
          archived_at?: string | null
        };
        Update: {
          id?: string
          slug?: string
          exam_id?: string
          subject_id?: string | null
          chapter_id?: string | null
          topic_id?: string | null
          paper_id?: string | null
          origin?: Database['public']['Enums']['question_origin']
          question_type?: Database['public']['Enums']['question_type']
          marking_scheme?: Database['public']['Enums']['marking_scheme']
          difficulty?: Database['public']['Enums']['difficulty'] | null
          marks?: number
          negative_marks?: number
          year?: number | null
          shift?: number | null
          session_label?: string | null
          question_number?: string | null
          question_text?: string
          structured_content?: Json
          answer_key?: Json | null
          answer_key_source?: Database['public']['Enums']['answer_key_source'] | null
          source_id?: string | null
          source_question_id?: string | null
          content_hash?: string | null
          dedupe_text?: string | null
          ingestion_status?: Database['public']['Enums']['ingestion_status']
          verification_status?: Database['public']['Enums']['verification_status']
          publication_status?: Database['public']['Enums']['publication_status']
          indexability?: Database['public']['Enums']['indexability']
          sitemap_include?: boolean
          access_tier?: Database['public']['Enums']['access_tier']
          current_solution_id?: string | null
          seo_title?: string | null
          seo_description?: string | null
          search_tsv?: string | null
          row_version?: number
          created_by?: string | null
          created_at?: string
          updated_at?: string
          published_at?: string | null
          first_published_at?: string | null
          archived_at?: string | null
        };
        Relationships: [];
      };
      review_events: {
        Row: {
          id: number
          question_id: string
          solution_version_id: string | null
          actor_id: string | null
          action: Database['public']['Enums']['review_action']
          from_verification_status: Database['public']['Enums']['verification_status'] | null
          to_verification_status: Database['public']['Enums']['verification_status'] | null
          from_publication_status: Database['public']['Enums']['publication_status'] | null
          to_publication_status: Database['public']['Enums']['publication_status'] | null
          note: string | null
          created_at: string
        };
        Insert: {
          id?: number
          question_id: string
          solution_version_id?: string | null
          actor_id?: string | null
          action: Database['public']['Enums']['review_action']
          from_verification_status?: Database['public']['Enums']['verification_status'] | null
          to_verification_status?: Database['public']['Enums']['verification_status'] | null
          from_publication_status?: Database['public']['Enums']['publication_status'] | null
          to_publication_status?: Database['public']['Enums']['publication_status'] | null
          note?: string | null
          created_at?: string
        };
        Update: {
          id?: number
          question_id?: string
          solution_version_id?: string | null
          actor_id?: string | null
          action?: Database['public']['Enums']['review_action']
          from_verification_status?: Database['public']['Enums']['verification_status'] | null
          to_verification_status?: Database['public']['Enums']['verification_status'] | null
          from_publication_status?: Database['public']['Enums']['publication_status'] | null
          to_publication_status?: Database['public']['Enums']['publication_status'] | null
          note?: string | null
          created_at?: string
        };
        Relationships: [];
      };
      slug_redirects: {
        Row: {
          old_slug: string
          question_id: string
          created_at: string
        };
        Insert: {
          old_slug: string
          question_id: string
          created_at?: string
        };
        Update: {
          old_slug?: string
          question_id?: string
          created_at?: string
        };
        Relationships: [];
      };
      solution_versions: {
        Row: {
          id: string
          question_id: string
          version: number
          final_answer: Json
          summary: string | null
          steps: Json
          formulas: Json
          concepts: string[]
          alternatives: Json
          shortcuts: Json
          common_mistakes: Json
          sympy_checks: Json
          provenance: Database['public']['Enums']['solution_provenance']
          ai_run_id: string | null
          based_on_version_id: string | null
          author_id: string | null
          edit_note: string | null
          review_status: Database['public']['Enums']['solution_review_status']
          reviewed_by: string | null
          reviewed_at: string | null
          created_at: string
        };
        Insert: {
          id?: string
          question_id: string
          version: number
          final_answer: Json
          summary?: string | null
          steps: Json
          formulas?: Json
          concepts?: string[]
          alternatives?: Json
          shortcuts?: Json
          common_mistakes?: Json
          sympy_checks?: Json
          provenance: Database['public']['Enums']['solution_provenance']
          ai_run_id?: string | null
          based_on_version_id?: string | null
          author_id?: string | null
          edit_note?: string | null
          review_status?: Database['public']['Enums']['solution_review_status']
          reviewed_by?: string | null
          reviewed_at?: string | null
          created_at?: string
        };
        Update: {
          id?: string
          question_id?: string
          version?: number
          final_answer?: Json
          summary?: string | null
          steps?: Json
          formulas?: Json
          concepts?: string[]
          alternatives?: Json
          shortcuts?: Json
          common_mistakes?: Json
          sympy_checks?: Json
          provenance?: Database['public']['Enums']['solution_provenance']
          ai_run_id?: string | null
          based_on_version_id?: string | null
          author_id?: string | null
          edit_note?: string | null
          review_status?: Database['public']['Enums']['solution_review_status']
          reviewed_by?: string | null
          reviewed_at?: string | null
          created_at?: string
        };
        Relationships: [];
      };
      source_documents: {
        Row: {
          id: string
          source_id: string
          paper_id: string | null
          kind: Database['public']['Enums']['source_document_kind']
          bucket: Database['public']['Enums']['storage_bucket']
          r2_key: string
          original_filename: string
          mime_type: string
          bytes: number
          sha256: string
          page_count: number | null
          uploaded_by: string | null
          created_at: string
        };
        Insert: {
          id?: string
          source_id: string
          paper_id?: string | null
          kind: Database['public']['Enums']['source_document_kind']
          bucket?: Database['public']['Enums']['storage_bucket']
          r2_key: string
          original_filename: string
          mime_type: string
          bytes: number
          sha256: string
          page_count?: number | null
          uploaded_by?: string | null
          created_at?: string
        };
        Update: {
          id?: string
          source_id?: string
          paper_id?: string | null
          kind?: Database['public']['Enums']['source_document_kind']
          bucket?: Database['public']['Enums']['storage_bucket']
          r2_key?: string
          original_filename?: string
          mime_type?: string
          bytes?: number
          sha256?: string
          page_count?: number | null
          uploaded_by?: string | null
          created_at?: string
        };
        Relationships: [];
      };
      source_questions: {
        Row: {
          id: string
          source_document_id: string
          job_id: string | null
          question_number: string
          external_question_id: string | null
          page_start: number
          page_end: number
          status: Database['public']['Enums']['source_question_status']
          normalized: Json
          normalized_text: string
          content_hash: string
          extraction_method: string
          ocr_mean_confidence: number | null
          warnings: string[]
          duplicate_of_question_id: string | null
          possible_duplicate_of: string | null
          duplicate_similarity: number | null
          promoted_question_id: string | null
          created_at: string
          updated_at: string
        };
        Insert: {
          id?: string
          source_document_id: string
          job_id?: string | null
          question_number: string
          external_question_id?: string | null
          page_start: number
          page_end: number
          status?: Database['public']['Enums']['source_question_status']
          normalized: Json
          normalized_text: string
          content_hash: string
          extraction_method: string
          ocr_mean_confidence?: number | null
          warnings?: string[]
          duplicate_of_question_id?: string | null
          possible_duplicate_of?: string | null
          duplicate_similarity?: number | null
          promoted_question_id?: string | null
          created_at?: string
          updated_at?: string
        };
        Update: {
          id?: string
          source_document_id?: string
          job_id?: string | null
          question_number?: string
          external_question_id?: string | null
          page_start?: number
          page_end?: number
          status?: Database['public']['Enums']['source_question_status']
          normalized?: Json
          normalized_text?: string
          content_hash?: string
          extraction_method?: string
          ocr_mean_confidence?: number | null
          warnings?: string[]
          duplicate_of_question_id?: string | null
          possible_duplicate_of?: string | null
          duplicate_similarity?: number | null
          promoted_question_id?: string | null
          created_at?: string
          updated_at?: string
        };
        Relationships: [];
      };
      sources: {
        Row: {
          id: string
          code: string
          name: string
          kind: Database['public']['Enums']['source_kind']
          publisher: string | null
          homepage_url: string | null
          license_name: string | null
          license_url: string | null
          reuse_permitted: boolean
          attribution_text: string | null
          approved_by: string | null
          approved_at: string | null
          notes: string | null
          created_at: string
          updated_at: string
        };
        Insert: {
          id?: string
          code: string
          name: string
          kind: Database['public']['Enums']['source_kind']
          publisher?: string | null
          homepage_url?: string | null
          license_name?: string | null
          license_url?: string | null
          reuse_permitted?: boolean
          attribution_text?: string | null
          approved_by?: string | null
          approved_at?: string | null
          notes?: string | null
          created_at?: string
          updated_at?: string
        };
        Update: {
          id?: string
          code?: string
          name?: string
          kind?: Database['public']['Enums']['source_kind']
          publisher?: string | null
          homepage_url?: string | null
          license_name?: string | null
          license_url?: string | null
          reuse_permitted?: boolean
          attribution_text?: string | null
          approved_by?: string | null
          approved_at?: string | null
          notes?: string | null
          created_at?: string
          updated_at?: string
        };
        Relationships: [];
      };
      streaks: {
        Row: {
          user_id: string
          current_streak: number
          longest_streak: number
          last_active_date: string | null
          updated_at: string
        };
        Insert: {
          user_id: string
          current_streak?: number
          longest_streak?: number
          last_active_date?: string | null
          updated_at?: string
        };
        Update: {
          user_id?: string
          current_streak?: number
          longest_streak?: number
          last_active_date?: string | null
          updated_at?: string
        };
        Relationships: [];
      };
      subjects: {
        Row: {
          id: string
          exam_id: string
          code: string
          slug: string
          segment: string
          name: string
          is_active: boolean
          sort_order: number
          created_at: string
          updated_at: string
        };
        Insert: {
          id?: string
          exam_id: string
          code: string
          slug: string
          segment: string
          name: string
          is_active?: boolean
          sort_order?: number
          created_at?: string
          updated_at?: string
        };
        Update: {
          id?: string
          exam_id?: string
          code?: string
          slug?: string
          segment?: string
          name?: string
          is_active?: boolean
          sort_order?: number
          created_at?: string
          updated_at?: string
        };
        Relationships: [];
      };
      topics: {
        Row: {
          id: string
          chapter_id: string
          slug: string
          segment: string
          name: string
          is_active: boolean
          sort_order: number
          created_at: string
          updated_at: string
        };
        Insert: {
          id?: string
          chapter_id: string
          slug: string
          segment: string
          name: string
          is_active?: boolean
          sort_order?: number
          created_at?: string
          updated_at?: string
        };
        Update: {
          id?: string
          chapter_id?: string
          slug?: string
          segment?: string
          name?: string
          is_active?: boolean
          sort_order?: number
          created_at?: string
          updated_at?: string
        };
        Relationships: [];
      };
      usage_counters: {
        Row: {
          day: string
          metric: string
          value: number
          updated_at: string
        };
        Insert: {
          day: string
          metric: string
          value?: number
          updated_at?: string
        };
        Update: {
          day?: string
          metric?: string
          value?: number
          updated_at?: string
        };
        Relationships: [];
      };
      user_chapter_stats: {
        Row: {
          user_id: string
          chapter_id: string
          subject_id: string
          exam_id: string
          attempts_count: number
          correct_count: number
          total_time_ms: number
          last_attempt_at: string
        };
        Insert: {
          user_id: string
          chapter_id: string
          subject_id: string
          exam_id: string
          attempts_count?: number
          correct_count?: number
          total_time_ms?: number
          last_attempt_at: string
        };
        Update: {
          user_id?: string
          chapter_id?: string
          subject_id?: string
          exam_id?: string
          attempts_count?: number
          correct_count?: number
          total_time_ms?: number
          last_attempt_at?: string
        };
        Relationships: [];
      };
      user_exam_preferences: {
        Row: {
          user_id: string
          exam_id: string
          is_primary: boolean
          target_year: number | null
          created_at: string
          updated_at: string
        };
        Insert: {
          user_id: string
          exam_id: string
          is_primary?: boolean
          target_year?: number | null
          created_at?: string
          updated_at?: string
        };
        Update: {
          user_id?: string
          exam_id?: string
          is_primary?: boolean
          target_year?: number | null
          created_at?: string
          updated_at?: string
        };
        Relationships: [];
      };
      user_roles: {
        Row: {
          user_id: string
          role: Database['public']['Enums']['app_role']
          granted_by: string | null
          created_at: string
        };
        Insert: {
          user_id: string
          role: Database['public']['Enums']['app_role']
          granted_by?: string | null
          created_at?: string
        };
        Update: {
          user_id?: string
          role?: Database['public']['Enums']['app_role']
          granted_by?: string | null
          created_at?: string
        };
        Relationships: [];
      };
      user_uploads: {
        Row: {
          id: string
          user_id: string
          purpose: Database['public']['Enums']['upload_purpose']
          bucket: Database['public']['Enums']['storage_bucket']
          r2_key: string
          mime_type: string
          bytes: number
          sha256: string
          status: Database['public']['Enums']['upload_status']
          created_at: string
        };
        Insert: {
          id?: string
          user_id: string
          purpose: Database['public']['Enums']['upload_purpose']
          bucket?: Database['public']['Enums']['storage_bucket']
          r2_key: string
          mime_type: string
          bytes: number
          sha256: string
          status?: Database['public']['Enums']['upload_status']
          created_at?: string
        };
        Update: {
          id?: string
          user_id?: string
          purpose?: Database['public']['Enums']['upload_purpose']
          bucket?: Database['public']['Enums']['storage_bucket']
          r2_key?: string
          mime_type?: string
          bytes?: number
          sha256?: string
          status?: Database['public']['Enums']['upload_status']
          created_at?: string
        };
        Relationships: [];
      };
      verification_checks: {
        Row: {
          id: string
          verification_run_id: string
          kind: Database['public']['Enums']['check_kind']
          result: Database['public']['Enums']['check_result']
          details: Json
          ai_run_id: string | null
          created_at: string
        };
        Insert: {
          id?: string
          verification_run_id: string
          kind: Database['public']['Enums']['check_kind']
          result: Database['public']['Enums']['check_result']
          details?: Json
          ai_run_id?: string | null
          created_at?: string
        };
        Update: {
          id?: string
          verification_run_id?: string
          kind?: Database['public']['Enums']['check_kind']
          result?: Database['public']['Enums']['check_result']
          details?: Json
          ai_run_id?: string | null
          created_at?: string
        };
        Relationships: [];
      };
      verification_runs: {
        Row: {
          id: string
          question_id: string
          solution_version_id: string | null
          job_id: string | null
          rules_version: string
          outcome: Database['public']['Enums']['verification_outcome'] | null
          resulting_status: Database['public']['Enums']['verification_status'] | null
          reasons: string[]
          started_at: string
          finished_at: string | null
        };
        Insert: {
          id?: string
          question_id: string
          solution_version_id?: string | null
          job_id?: string | null
          rules_version: string
          outcome?: Database['public']['Enums']['verification_outcome'] | null
          resulting_status?: Database['public']['Enums']['verification_status'] | null
          reasons?: string[]
          started_at?: string
          finished_at?: string | null
        };
        Update: {
          id?: string
          question_id?: string
          solution_version_id?: string | null
          job_id?: string | null
          rules_version?: string
          outcome?: Database['public']['Enums']['verification_outcome'] | null
          resulting_status?: Database['public']['Enums']['verification_status'] | null
          reasons?: string[]
          started_at?: string
          finished_at?: string | null
        };
        Relationships: [];
      };
    };
    Views: { [_ in never]: never };
    Functions: { [_ in never]: never };
    Enums: {
      access_tier: 'FREE' | 'PREMIUM';
      ai_run_status: 'SUCCEEDED' | 'FAILED' | 'SCHEMA_INVALID' | 'BLOCKED';
      ai_task: 'CLASSIFY' | 'ANSWER' | 'SOLVE' | 'ALTERNATIVES' | 'CRITIQUE' | 'QUALITY' | 'SEO_META';
      answer_key_source: 'OFFICIAL' | 'HUMAN' | 'AI_CONSENSUS';
      app_role: 'ADMIN' | 'REVIEWER';
      asset_kind: 'IMAGE' | 'DIAGRAM' | 'TABLE_IMAGE' | 'ORIGINAL_CROP';
      check_kind: 'OFFICIAL_KEY_MATCH' | 'INDEPENDENT_ANSWER_AGREEMENT' | 'SYMPY_CHECK' | 'AI_CRITIQUE' | 'CONTENT_COMPLETENESS' | 'CLASSIFICATION_CONFIDENCE';
      check_result: 'PASS' | 'FAIL' | 'INCONCLUSIVE' | 'SKIPPED' | 'ERROR';
      difficulty: 'EASY' | 'MEDIUM' | 'HARD';
      doubt_status: 'OPEN' | 'ANSWERED' | 'CLOSED' | 'SPAM';
      goal_kind: 'DAILY_ATTEMPTS' | 'WEEKLY_ATTEMPTS' | 'CHAPTER_ACCURACY';
      indexability: 'AUTO' | 'NOINDEX';
      ingestion_status: 'IMPORTED' | 'CLASSIFIED' | 'SOLVED' | 'CHECKED' | 'NEEDS_ATTENTION';
      job_event_level: 'DEBUG' | 'INFO' | 'WARN' | 'ERROR';
      job_kind: 'PROCESS_DOCUMENT' | 'PARSE_ANSWER_KEY' | 'AI_CLASSIFY' | 'AI_SOLVE' | 'AI_VERIFY' | 'AI_SEO';
      job_status: 'QUEUED' | 'RUNNING' | 'SUCCEEDED' | 'DEAD' | 'CANCELLED';
      marking_scheme: 'STANDARD' | 'PARTIAL_MULTI';
      practice_mode: 'SUBJECT' | 'CHAPTER' | 'TOPIC' | 'MIXED' | 'PYQ_PAPER' | 'MISTAKES' | 'BOOKMARKS';
      publication_status: 'DRAFT' | 'PUBLISHED' | 'ARCHIVED';
      question_origin: 'PYQ' | 'AI_GENERATED' | 'EDITORIAL';
      question_type: 'SINGLE_MCQ' | 'MULTI_MCQ' | 'NUMERICAL';
      review_action: 'APPROVE' | 'REJECT_SOLUTION' | 'REJECT_QUESTION' | 'EDIT_CONTENT' | 'EDIT_SOLUTION' | 'PUBLISH' | 'UNPUBLISH' | 'ARCHIVE' | 'RESTORE' | 'MARK_DISPUTED' | 'RESOLVE_DISPUTE' | 'SET_INDEXABILITY' | 'REQUEST_REVERIFY';
      session_status: 'ACTIVE' | 'COMPLETED' | 'ABANDONED';
      solution_provenance: 'AI_GENERATED' | 'AI_HUMAN_EDITED' | 'HUMAN_AUTHORED' | 'OFFICIAL';
      solution_review_status: 'PENDING' | 'APPROVED' | 'REJECTED' | 'SUPERSEDED';
      source_document_kind: 'QUESTION_PAPER' | 'ANSWER_KEY' | 'OTHER';
      source_kind: 'OFFICIAL_EXAM_BODY' | 'LICENSED_PUBLISHER' | 'EDITORIAL_TEAM' | 'AI_GENERATION';
      source_question_status: 'EXTRACTED' | 'NORMALIZED' | 'DUPLICATE' | 'PROMOTED' | 'REJECTED';
      storage_bucket: 'SOURCE_DOCS' | 'PUBLIC_ASSETS' | 'USER_UPLOADS';
      upload_purpose: 'DOUBT_ATTACHMENT';
      upload_status: 'CONFIRMED' | 'REJECTED' | 'DELETED';
      verification_outcome: 'PASSED' | 'NEEDS_REVIEW' | 'FAILED';
      verification_status: 'PENDING' | 'AUTOMATED_CHECKS_PASSED' | 'OFFICIAL_KEY_MATCHED' | 'HUMAN_REVIEW_REQUIRED' | 'HUMAN_VERIFIED' | 'DISPUTED';
    };
    CompositeTypes: { [_ in never]: never };
  };
};

export const enumValues = {
  access_tier: ['FREE', 'PREMIUM'],
  ai_run_status: ['SUCCEEDED', 'FAILED', 'SCHEMA_INVALID', 'BLOCKED'],
  ai_task: ['CLASSIFY', 'ANSWER', 'SOLVE', 'ALTERNATIVES', 'CRITIQUE', 'QUALITY', 'SEO_META'],
  answer_key_source: ['OFFICIAL', 'HUMAN', 'AI_CONSENSUS'],
  app_role: ['ADMIN', 'REVIEWER'],
  asset_kind: ['IMAGE', 'DIAGRAM', 'TABLE_IMAGE', 'ORIGINAL_CROP'],
  check_kind: ['OFFICIAL_KEY_MATCH', 'INDEPENDENT_ANSWER_AGREEMENT', 'SYMPY_CHECK', 'AI_CRITIQUE', 'CONTENT_COMPLETENESS', 'CLASSIFICATION_CONFIDENCE'],
  check_result: ['PASS', 'FAIL', 'INCONCLUSIVE', 'SKIPPED', 'ERROR'],
  difficulty: ['EASY', 'MEDIUM', 'HARD'],
  doubt_status: ['OPEN', 'ANSWERED', 'CLOSED', 'SPAM'],
  goal_kind: ['DAILY_ATTEMPTS', 'WEEKLY_ATTEMPTS', 'CHAPTER_ACCURACY'],
  indexability: ['AUTO', 'NOINDEX'],
  ingestion_status: ['IMPORTED', 'CLASSIFIED', 'SOLVED', 'CHECKED', 'NEEDS_ATTENTION'],
  job_event_level: ['DEBUG', 'INFO', 'WARN', 'ERROR'],
  job_kind: ['PROCESS_DOCUMENT', 'PARSE_ANSWER_KEY', 'AI_CLASSIFY', 'AI_SOLVE', 'AI_VERIFY', 'AI_SEO'],
  job_status: ['QUEUED', 'RUNNING', 'SUCCEEDED', 'DEAD', 'CANCELLED'],
  marking_scheme: ['STANDARD', 'PARTIAL_MULTI'],
  practice_mode: ['SUBJECT', 'CHAPTER', 'TOPIC', 'MIXED', 'PYQ_PAPER', 'MISTAKES', 'BOOKMARKS'],
  publication_status: ['DRAFT', 'PUBLISHED', 'ARCHIVED'],
  question_origin: ['PYQ', 'AI_GENERATED', 'EDITORIAL'],
  question_type: ['SINGLE_MCQ', 'MULTI_MCQ', 'NUMERICAL'],
  review_action: ['APPROVE', 'REJECT_SOLUTION', 'REJECT_QUESTION', 'EDIT_CONTENT', 'EDIT_SOLUTION', 'PUBLISH', 'UNPUBLISH', 'ARCHIVE', 'RESTORE', 'MARK_DISPUTED', 'RESOLVE_DISPUTE', 'SET_INDEXABILITY', 'REQUEST_REVERIFY'],
  session_status: ['ACTIVE', 'COMPLETED', 'ABANDONED'],
  solution_provenance: ['AI_GENERATED', 'AI_HUMAN_EDITED', 'HUMAN_AUTHORED', 'OFFICIAL'],
  solution_review_status: ['PENDING', 'APPROVED', 'REJECTED', 'SUPERSEDED'],
  source_document_kind: ['QUESTION_PAPER', 'ANSWER_KEY', 'OTHER'],
  source_kind: ['OFFICIAL_EXAM_BODY', 'LICENSED_PUBLISHER', 'EDITORIAL_TEAM', 'AI_GENERATION'],
  source_question_status: ['EXTRACTED', 'NORMALIZED', 'DUPLICATE', 'PROMOTED', 'REJECTED'],
  storage_bucket: ['SOURCE_DOCS', 'PUBLIC_ASSETS', 'USER_UPLOADS'],
  upload_purpose: ['DOUBT_ATTACHMENT'],
  upload_status: ['CONFIRMED', 'REJECTED', 'DELETED'],
  verification_outcome: ['PASSED', 'NEEDS_REVIEW', 'FAILED'],
  verification_status: ['PENDING', 'AUTOMATED_CHECKS_PASSED', 'OFFICIAL_KEY_MATCHED', 'HUMAN_REVIEW_REQUIRED', 'HUMAN_VERIFIED', 'DISPUTED'],
} as const;
