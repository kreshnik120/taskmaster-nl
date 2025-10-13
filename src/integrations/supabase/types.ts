export type Json =
  | string
  | number
  | boolean
  | null
  | { [key: string]: Json | undefined }
  | Json[]

export type Database = {
  // Allows to automatically instantiate createClient with right options
  // instead of createClient<Database, { PostgrestVersion: 'XX' }>(URL, KEY)
  __InternalSupabase: {
    PostgrestVersion: "13.0.5"
  }
  public: {
    Tables: {
      ai_categories: {
        Row: {
          auto_generated: boolean | null
          confidence_score: number | null
          created_at: string | null
          description: string | null
          id: string
          item_count: number | null
          keywords: string[] | null
          name: string
          org_id: string
          parent_category: string | null
          updated_at: string | null
        }
        Insert: {
          auto_generated?: boolean | null
          confidence_score?: number | null
          created_at?: string | null
          description?: string | null
          id?: string
          item_count?: number | null
          keywords?: string[] | null
          name: string
          org_id: string
          parent_category?: string | null
          updated_at?: string | null
        }
        Update: {
          auto_generated?: boolean | null
          confidence_score?: number | null
          created_at?: string | null
          description?: string | null
          id?: string
          item_count?: number | null
          keywords?: string[] | null
          name?: string
          org_id?: string
          parent_category?: string | null
          updated_at?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "ai_categories_org_id_fkey"
            columns: ["org_id"]
            isOneToOne: false
            referencedRelation: "organizations"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "ai_categories_parent_category_fkey"
            columns: ["parent_category"]
            isOneToOne: false
            referencedRelation: "ai_categories"
            referencedColumns: ["id"]
          },
        ]
      }
      ai_knowledge_base: {
        Row: {
          acl: Json | null
          assignment_id: string | null
          auto_reviewed_at: string | null
          category: string
          chunk_id: string | null
          chunk_index: number | null
          client_id: string | null
          confidence_score: number | null
          confidentiality:
            | Database["public"]["Enums"]["confidentiality_level"]
            | null
          created_at: string | null
          deleted_at: string | null
          deleted_by: string | null
          deletion_reason: Json | null
          id: string
          jurisdiction: string | null
          key: string
          last_reviewed_at: string | null
          last_used_at: string | null
          last_validation_error: string | null
          last_verified: string | null
          needs_review: boolean | null
          org_id: string
          original_text: string | null
          redacted_text: string | null
          retrieved_at: string | null
          review_count: number | null
          role_tags: string[] | null
          source: string | null
          source_title: string | null
          source_url: string | null
          updated_at: string | null
          usage_count: number | null
          user_id: string
          valid_from: string | null
          valid_to: string | null
          validation_failures: number | null
          validation_status: string | null
          value: Json
        }
        Insert: {
          acl?: Json | null
          assignment_id?: string | null
          auto_reviewed_at?: string | null
          category: string
          chunk_id?: string | null
          chunk_index?: number | null
          client_id?: string | null
          confidence_score?: number | null
          confidentiality?:
            | Database["public"]["Enums"]["confidentiality_level"]
            | null
          created_at?: string | null
          deleted_at?: string | null
          deleted_by?: string | null
          deletion_reason?: Json | null
          id?: string
          jurisdiction?: string | null
          key: string
          last_reviewed_at?: string | null
          last_used_at?: string | null
          last_validation_error?: string | null
          last_verified?: string | null
          needs_review?: boolean | null
          org_id: string
          original_text?: string | null
          redacted_text?: string | null
          retrieved_at?: string | null
          review_count?: number | null
          role_tags?: string[] | null
          source?: string | null
          source_title?: string | null
          source_url?: string | null
          updated_at?: string | null
          usage_count?: number | null
          user_id: string
          valid_from?: string | null
          valid_to?: string | null
          validation_failures?: number | null
          validation_status?: string | null
          value: Json
        }
        Update: {
          acl?: Json | null
          assignment_id?: string | null
          auto_reviewed_at?: string | null
          category?: string
          chunk_id?: string | null
          chunk_index?: number | null
          client_id?: string | null
          confidence_score?: number | null
          confidentiality?:
            | Database["public"]["Enums"]["confidentiality_level"]
            | null
          created_at?: string | null
          deleted_at?: string | null
          deleted_by?: string | null
          deletion_reason?: Json | null
          id?: string
          jurisdiction?: string | null
          key?: string
          last_reviewed_at?: string | null
          last_used_at?: string | null
          last_validation_error?: string | null
          last_verified?: string | null
          needs_review?: boolean | null
          org_id?: string
          original_text?: string | null
          redacted_text?: string | null
          retrieved_at?: string | null
          review_count?: number | null
          role_tags?: string[] | null
          source?: string | null
          source_title?: string | null
          source_url?: string | null
          updated_at?: string | null
          usage_count?: number | null
          user_id?: string
          valid_from?: string | null
          valid_to?: string | null
          validation_failures?: number | null
          validation_status?: string | null
          value?: Json
        }
        Relationships: [
          {
            foreignKeyName: "ai_knowledge_base_client_id_fkey"
            columns: ["client_id"]
            isOneToOne: false
            referencedRelation: "clients"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "ai_knowledge_base_org_id_fkey"
            columns: ["org_id"]
            isOneToOne: false
            referencedRelation: "organizations"
            referencedColumns: ["id"]
          },
        ]
      }
      ai_knowledge_versions: {
        Row: {
          ai_action_context: Json | null
          category: string
          change_reason: string | null
          change_type: string
          changed_by: string | null
          confidence_score: number | null
          created_at: string
          id: string
          key: string
          knowledge_id: string
          value: Json
          version_number: number
        }
        Insert: {
          ai_action_context?: Json | null
          category: string
          change_reason?: string | null
          change_type: string
          changed_by?: string | null
          confidence_score?: number | null
          created_at?: string
          id?: string
          key: string
          knowledge_id: string
          value: Json
          version_number: number
        }
        Update: {
          ai_action_context?: Json | null
          category?: string
          change_reason?: string | null
          change_type?: string
          changed_by?: string | null
          confidence_score?: number | null
          created_at?: string
          id?: string
          key?: string
          knowledge_id?: string
          value?: Json
          version_number?: number
        }
        Relationships: [
          {
            foreignKeyName: "ai_knowledge_versions_knowledge_id_fkey"
            columns: ["knowledge_id"]
            isOneToOne: false
            referencedRelation: "ai_knowledge_base"
            referencedColumns: ["id"]
          },
        ]
      }
      ai_learning_events: {
        Row: {
          ai_response: Json | null
          applied_to_knowledge_base: boolean | null
          confidence_score: number | null
          context: Json
          created_at: string | null
          event_type: string
          id: string
          learning_score: number | null
          org_id: string
          outcome: string | null
          user_action: Json | null
          user_id: string
        }
        Insert: {
          ai_response?: Json | null
          applied_to_knowledge_base?: boolean | null
          confidence_score?: number | null
          context: Json
          created_at?: string | null
          event_type: string
          id?: string
          learning_score?: number | null
          org_id: string
          outcome?: string | null
          user_action?: Json | null
          user_id: string
        }
        Update: {
          ai_response?: Json | null
          applied_to_knowledge_base?: boolean | null
          confidence_score?: number | null
          context?: Json
          created_at?: string | null
          event_type?: string
          id?: string
          learning_score?: number | null
          org_id?: string
          outcome?: string | null
          user_action?: Json | null
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "ai_learning_events_org_id_fkey"
            columns: ["org_id"]
            isOneToOne: false
            referencedRelation: "organizations"
            referencedColumns: ["id"]
          },
        ]
      }
      ai_meta_patterns: {
        Row: {
          applied_at: string | null
          confidence: number | null
          created_at: string | null
          id: string
          occurrences: number | null
          org_id: string
          pattern_data: Json | null
          pattern_description: string
          suggested_category: string | null
        }
        Insert: {
          applied_at?: string | null
          confidence?: number | null
          created_at?: string | null
          id?: string
          occurrences?: number | null
          org_id: string
          pattern_data?: Json | null
          pattern_description: string
          suggested_category?: string | null
        }
        Update: {
          applied_at?: string | null
          confidence?: number | null
          created_at?: string | null
          id?: string
          occurrences?: number | null
          org_id?: string
          pattern_data?: Json | null
          pattern_description?: string
          suggested_category?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "ai_meta_patterns_org_id_fkey"
            columns: ["org_id"]
            isOneToOne: false
            referencedRelation: "organizations"
            referencedColumns: ["id"]
          },
        ]
      }
      ai_performance_metrics: {
        Row: {
          created_at: string | null
          id: string
          metadata: Json | null
          metric_type: string
          org_id: string
          period_end: string
          period_start: string
          sample_size: number | null
          value: number
        }
        Insert: {
          created_at?: string | null
          id?: string
          metadata?: Json | null
          metric_type: string
          org_id: string
          period_end: string
          period_start: string
          sample_size?: number | null
          value: number
        }
        Update: {
          created_at?: string | null
          id?: string
          metadata?: Json | null
          metric_type?: string
          org_id?: string
          period_end?: string
          period_start?: string
          sample_size?: number | null
          value?: number
        }
        Relationships: []
      }
      ai_response_cache: {
        Row: {
          created_at: string
          expires_at: string
          hit_count: number
          id: string
          knowledge_ids: string[]
          org_id: string
          question: string
          question_hash: string
          response: string
        }
        Insert: {
          created_at?: string
          expires_at?: string
          hit_count?: number
          id?: string
          knowledge_ids?: string[]
          org_id: string
          question: string
          question_hash: string
          response: string
        }
        Update: {
          created_at?: string
          expires_at?: string
          hit_count?: number
          id?: string
          knowledge_ids?: string[]
          org_id?: string
          question?: string
          question_hash?: string
          response?: string
        }
        Relationships: []
      }
      application_conversations: {
        Row: {
          application_id: string
          content: string
          created_at: string | null
          id: string
          metadata: Json | null
          role: string
        }
        Insert: {
          application_id: string
          content: string
          created_at?: string | null
          id?: string
          metadata?: Json | null
          role: string
        }
        Update: {
          application_id?: string
          content?: string
          created_at?: string | null
          id?: string
          metadata?: Json | null
          role?: string
        }
        Relationships: [
          {
            foreignKeyName: "application_conversations_application_id_fkey"
            columns: ["application_id"]
            isOneToOne: false
            referencedRelation: "professional_applications"
            referencedColumns: ["id"]
          },
        ]
      }
      attachments: {
        Row: {
          created_at: string
          id: string
          name: string
          task_id: string
          url: string
        }
        Insert: {
          created_at?: string
          id?: string
          name: string
          task_id: string
          url: string
        }
        Update: {
          created_at?: string
          id?: string
          name?: string
          task_id?: string
          url?: string
        }
        Relationships: [
          {
            foreignKeyName: "attachments_task_id_fkey"
            columns: ["task_id"]
            isOneToOne: false
            referencedRelation: "tasks"
            referencedColumns: ["id"]
          },
        ]
      }
      business_intelligence: {
        Row: {
          data: Json
          description: string | null
          detected_at: string | null
          id: string
          impact_score: number | null
          intelligence_type: string
          last_updated_at: string | null
          org_id: string
          priority: string | null
          severity: string | null
          status: string | null
          title: string
          type: string | null
        }
        Insert: {
          data: Json
          description?: string | null
          detected_at?: string | null
          id?: string
          impact_score?: number | null
          intelligence_type: string
          last_updated_at?: string | null
          org_id: string
          priority?: string | null
          severity?: string | null
          status?: string | null
          title: string
          type?: string | null
        }
        Update: {
          data?: Json
          description?: string | null
          detected_at?: string | null
          id?: string
          impact_score?: number | null
          intelligence_type?: string
          last_updated_at?: string | null
          org_id?: string
          priority?: string | null
          severity?: string | null
          status?: string | null
          title?: string
          type?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "business_intelligence_org_id_fkey"
            columns: ["org_id"]
            isOneToOne: false
            referencedRelation: "organizations"
            referencedColumns: ["id"]
          },
        ]
      }
      cache_analytics: {
        Row: {
          avg_query_time_ms: number
          cache_hits: number
          cache_misses: number
          date: string
          id: string
          org_id: string
          total_cost_saved_eur: number
          total_tokens_saved: number
        }
        Insert: {
          avg_query_time_ms?: number
          cache_hits?: number
          cache_misses?: number
          date?: string
          id?: string
          org_id: string
          total_cost_saved_eur?: number
          total_tokens_saved?: number
        }
        Update: {
          avg_query_time_ms?: number
          cache_hits?: number
          cache_misses?: number
          date?: string
          id?: string
          org_id?: string
          total_cost_saved_eur?: number
          total_tokens_saved?: number
        }
        Relationships: []
      }
      chat_messages: {
        Row: {
          content: string
          content_hash: string | null
          conversation_id: string | null
          created_at: string | null
          id: string
          metadata: Json | null
          role: string
          user_id: string
        }
        Insert: {
          content: string
          content_hash?: string | null
          conversation_id?: string | null
          created_at?: string | null
          id?: string
          metadata?: Json | null
          role: string
          user_id: string
        }
        Update: {
          content?: string
          content_hash?: string | null
          conversation_id?: string | null
          created_at?: string | null
          id?: string
          metadata?: Json | null
          role?: string
          user_id?: string
        }
        Relationships: []
      }
      clients: {
        Row: {
          company: string
          created_at: string
          id: string
          name: string
          org_id: string
          revenue_per_hour: number | null
          tier: number
          updated_at: string
          weekly_hours: number | null
        }
        Insert: {
          company: string
          created_at?: string
          id?: string
          name: string
          org_id: string
          revenue_per_hour?: number | null
          tier?: number
          updated_at?: string
          weekly_hours?: number | null
        }
        Update: {
          company?: string
          created_at?: string
          id?: string
          name?: string
          org_id?: string
          revenue_per_hour?: number | null
          tier?: number
          updated_at?: string
          weekly_hours?: number | null
        }
        Relationships: [
          {
            foreignKeyName: "clients_org_id_fkey"
            columns: ["org_id"]
            isOneToOne: false
            referencedRelation: "organizations"
            referencedColumns: ["id"]
          },
        ]
      }
      columns: {
        Row: {
          created_at: string
          id: string
          name: string
          order: number
          project_id: string
          status: Database["public"]["Enums"]["task_status"]
          wip_limit: number | null
        }
        Insert: {
          created_at?: string
          id?: string
          name: string
          order: number
          project_id: string
          status: Database["public"]["Enums"]["task_status"]
          wip_limit?: number | null
        }
        Update: {
          created_at?: string
          id?: string
          name?: string
          order?: number
          project_id?: string
          status?: Database["public"]["Enums"]["task_status"]
          wip_limit?: number | null
        }
        Relationships: [
          {
            foreignKeyName: "columns_project_id_fkey"
            columns: ["project_id"]
            isOneToOne: false
            referencedRelation: "projects"
            referencedColumns: ["id"]
          },
        ]
      }
      comments: {
        Row: {
          author_id: string
          body: string
          created_at: string
          id: string
          task_id: string
        }
        Insert: {
          author_id: string
          body: string
          created_at?: string
          id?: string
          task_id: string
        }
        Update: {
          author_id?: string
          body?: string
          created_at?: string
          id?: string
          task_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "comments_author_id_fkey"
            columns: ["author_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "comments_task_id_fkey"
            columns: ["task_id"]
            isOneToOne: false
            referencedRelation: "tasks"
            referencedColumns: ["id"]
          },
        ]
      }
      confidence_tracking: {
        Row: {
          created_at: string
          final_confidence: number
          harvester_triggered: boolean
          id: string
          initial_confidence: number
          iterations_count: number
          org_id: string
          question: string
          used_knowledge_ids: string[]
          user_id: string
        }
        Insert: {
          created_at?: string
          final_confidence: number
          harvester_triggered?: boolean
          id?: string
          initial_confidence: number
          iterations_count?: number
          org_id: string
          question: string
          used_knowledge_ids?: string[]
          user_id: string
        }
        Update: {
          created_at?: string
          final_confidence?: number
          harvester_triggered?: boolean
          id?: string
          initial_confidence?: number
          iterations_count?: number
          org_id?: string
          question?: string
          used_knowledge_ids?: string[]
          user_id?: string
        }
        Relationships: []
      }
      conversation_context: {
        Row: {
          category: string
          conversation_id: string
          created_at: string | null
          ended_at: string | null
          id: string
          key_points: Json | null
          sentiment: string | null
          summary: string | null
          topics: string[] | null
          user_id: string
        }
        Insert: {
          category: string
          conversation_id: string
          created_at?: string | null
          ended_at?: string | null
          id?: string
          key_points?: Json | null
          sentiment?: string | null
          summary?: string | null
          topics?: string[] | null
          user_id: string
        }
        Update: {
          category?: string
          conversation_id?: string
          created_at?: string | null
          ended_at?: string | null
          id?: string
          key_points?: Json | null
          sentiment?: string | null
          summary?: string | null
          topics?: string[] | null
          user_id?: string
        }
        Relationships: []
      }
      dependencies: {
        Row: {
          created_at: string
          from_task_id: string
          id: string
          to_task_id: string
          type: Database["public"]["Enums"]["dependency_type"]
        }
        Insert: {
          created_at?: string
          from_task_id: string
          id?: string
          to_task_id: string
          type?: Database["public"]["Enums"]["dependency_type"]
        }
        Update: {
          created_at?: string
          from_task_id?: string
          id?: string
          to_task_id?: string
          type?: Database["public"]["Enums"]["dependency_type"]
        }
        Relationships: [
          {
            foreignKeyName: "dependencies_from_task_id_fkey"
            columns: ["from_task_id"]
            isOneToOne: false
            referencedRelation: "tasks"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "dependencies_to_task_id_fkey"
            columns: ["to_task_id"]
            isOneToOne: false
            referencedRelation: "tasks"
            referencedColumns: ["id"]
          },
        ]
      }
      function_call_logs: {
        Row: {
          created_at: string | null
          error_message: string | null
          estimated_cost_eur: number | null
          execution_time_ms: number | null
          function_name: string
          id: string
          input_tokens: number | null
          model_used: string | null
          org_id: string
          output_tokens: number | null
          success: boolean | null
          total_tokens: number | null
          user_id: string
        }
        Insert: {
          created_at?: string | null
          error_message?: string | null
          estimated_cost_eur?: number | null
          execution_time_ms?: number | null
          function_name: string
          id?: string
          input_tokens?: number | null
          model_used?: string | null
          org_id: string
          output_tokens?: number | null
          success?: boolean | null
          total_tokens?: number | null
          user_id: string
        }
        Update: {
          created_at?: string | null
          error_message?: string | null
          estimated_cost_eur?: number | null
          execution_time_ms?: number | null
          function_name?: string
          id?: string
          input_tokens?: number | null
          model_used?: string | null
          org_id?: string
          output_tokens?: number | null
          success?: boolean | null
          total_tokens?: number | null
          user_id?: string
        }
        Relationships: []
      }
      interview_appointments: {
        Row: {
          application_id: string
          confirmation_sent_at: string | null
          created_at: string | null
          duration_min: number | null
          id: string
          location: string | null
          meeting_link: string | null
          notes: string | null
          org_id: string
          professional_id: string
          recruiter_id: string | null
          scheduled_at: string
          status: string
          task_id: string | null
          updated_at: string | null
        }
        Insert: {
          application_id: string
          confirmation_sent_at?: string | null
          created_at?: string | null
          duration_min?: number | null
          id?: string
          location?: string | null
          meeting_link?: string | null
          notes?: string | null
          org_id: string
          professional_id: string
          recruiter_id?: string | null
          scheduled_at: string
          status?: string
          task_id?: string | null
          updated_at?: string | null
        }
        Update: {
          application_id?: string
          confirmation_sent_at?: string | null
          created_at?: string | null
          duration_min?: number | null
          id?: string
          location?: string | null
          meeting_link?: string | null
          notes?: string | null
          org_id?: string
          professional_id?: string
          recruiter_id?: string | null
          scheduled_at?: string
          status?: string
          task_id?: string | null
          updated_at?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "interview_appointments_application_id_fkey"
            columns: ["application_id"]
            isOneToOne: false
            referencedRelation: "professional_applications"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "interview_appointments_professional_id_fkey"
            columns: ["professional_id"]
            isOneToOne: false
            referencedRelation: "professionals"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "interview_appointments_task_id_fkey"
            columns: ["task_id"]
            isOneToOne: false
            referencedRelation: "tasks"
            referencedColumns: ["id"]
          },
        ]
      }
      knowledge_embeddings: {
        Row: {
          created_at: string
          embedding: string
          id: string
          knowledge_id: string
          updated_at: string
        }
        Insert: {
          created_at?: string
          embedding: string
          id?: string
          knowledge_id: string
          updated_at?: string
        }
        Update: {
          created_at?: string
          embedding?: string
          id?: string
          knowledge_id?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "knowledge_embeddings_knowledge_id_fkey"
            columns: ["knowledge_id"]
            isOneToOne: true
            referencedRelation: "ai_knowledge_base"
            referencedColumns: ["id"]
          },
        ]
      }
      knowledge_relationships: {
        Row: {
          confidence_score: number
          context: string | null
          created_at: string | null
          detected_by: string
          id: string
          last_used_at: string | null
          metadata: Json | null
          relationship_type: string
          source_knowledge_id: string
          target_knowledge_id: string
          updated_at: string | null
          usage_count: number | null
        }
        Insert: {
          confidence_score?: number
          context?: string | null
          created_at?: string | null
          detected_by?: string
          id?: string
          last_used_at?: string | null
          metadata?: Json | null
          relationship_type: string
          source_knowledge_id: string
          target_knowledge_id: string
          updated_at?: string | null
          usage_count?: number | null
        }
        Update: {
          confidence_score?: number
          context?: string | null
          created_at?: string | null
          detected_by?: string
          id?: string
          last_used_at?: string | null
          metadata?: Json | null
          relationship_type?: string
          source_knowledge_id?: string
          target_knowledge_id?: string
          updated_at?: string | null
          usage_count?: number | null
        }
        Relationships: [
          {
            foreignKeyName: "knowledge_relationships_source_knowledge_id_fkey"
            columns: ["source_knowledge_id"]
            isOneToOne: false
            referencedRelation: "ai_knowledge_base"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "knowledge_relationships_target_knowledge_id_fkey"
            columns: ["target_knowledge_id"]
            isOneToOne: false
            referencedRelation: "ai_knowledge_base"
            referencedColumns: ["id"]
          },
        ]
      }
      message_feedback: {
        Row: {
          created_at: string | null
          feedback_type: string
          id: string
          message_id: string
          user_id: string
        }
        Insert: {
          created_at?: string | null
          feedback_type: string
          id?: string
          message_id: string
          user_id: string
        }
        Update: {
          created_at?: string | null
          feedback_type?: string
          id?: string
          message_id?: string
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "message_feedback_message_id_fkey"
            columns: ["message_id"]
            isOneToOne: false
            referencedRelation: "chat_messages"
            referencedColumns: ["id"]
          },
        ]
      }
      orchestrator_state: {
        Row: {
          categories_created: number | null
          created_at: string | null
          current_batch: number | null
          error_message: string | null
          id: string
          last_run_at: string | null
          metadata: Json | null
          org_id: string
          status: string | null
          total_items_processed: number | null
        }
        Insert: {
          categories_created?: number | null
          created_at?: string | null
          current_batch?: number | null
          error_message?: string | null
          id?: string
          last_run_at?: string | null
          metadata?: Json | null
          org_id: string
          status?: string | null
          total_items_processed?: number | null
        }
        Update: {
          categories_created?: number | null
          created_at?: string | null
          current_batch?: number | null
          error_message?: string | null
          id?: string
          last_run_at?: string | null
          metadata?: Json | null
          org_id?: string
          status?: string | null
          total_items_processed?: number | null
        }
        Relationships: [
          {
            foreignKeyName: "orchestrator_state_org_id_fkey"
            columns: ["org_id"]
            isOneToOne: false
            referencedRelation: "organizations"
            referencedColumns: ["id"]
          },
        ]
      }
      organizations: {
        Row: {
          created_at: string
          id: string
          name: string
        }
        Insert: {
          created_at?: string
          id?: string
          name: string
        }
        Update: {
          created_at?: string
          id?: string
          name?: string
        }
        Relationships: []
      }
      pii_patterns: {
        Row: {
          created_at: string | null
          enabled: boolean | null
          id: string
          pattern_type: string
          regex_pattern: string
          replacement_template: string | null
        }
        Insert: {
          created_at?: string | null
          enabled?: boolean | null
          id?: string
          pattern_type: string
          regex_pattern: string
          replacement_template?: string | null
        }
        Update: {
          created_at?: string | null
          enabled?: boolean | null
          id?: string
          pattern_type?: string
          regex_pattern?: string
          replacement_template?: string | null
        }
        Relationships: []
      }
      prioritizer_state: {
        Row: {
          betas: Json
          id: string
          last_updated: string
          percentiles: Json
          segment_key: string
          weights: Json
        }
        Insert: {
          betas?: Json
          id?: string
          last_updated?: string
          percentiles?: Json
          segment_key: string
          weights?: Json
        }
        Update: {
          betas?: Json
          id?: string
          last_updated?: string
          percentiles?: Json
          segment_key?: string
          weights?: Json
        }
        Relationships: []
      }
      processing_jobs: {
        Row: {
          chunk_index: number | null
          completed_at: string | null
          created_at: string | null
          error_message: string | null
          file_name: string
          file_path: string
          file_type: string
          id: string
          items_processed: number | null
          items_total: number | null
          metadata: Json | null
          org_id: string
          priority: number | null
          progress_pct: number | null
          result: Json | null
          retry_count: number | null
          started_at: string | null
          status: string | null
          total_chunks: number | null
          user_id: string
        }
        Insert: {
          chunk_index?: number | null
          completed_at?: string | null
          created_at?: string | null
          error_message?: string | null
          file_name: string
          file_path: string
          file_type: string
          id?: string
          items_processed?: number | null
          items_total?: number | null
          metadata?: Json | null
          org_id: string
          priority?: number | null
          progress_pct?: number | null
          result?: Json | null
          retry_count?: number | null
          started_at?: string | null
          status?: string | null
          total_chunks?: number | null
          user_id: string
        }
        Update: {
          chunk_index?: number | null
          completed_at?: string | null
          created_at?: string | null
          error_message?: string | null
          file_name?: string
          file_path?: string
          file_type?: string
          id?: string
          items_processed?: number | null
          items_total?: number | null
          metadata?: Json | null
          org_id?: string
          priority?: number | null
          progress_pct?: number | null
          result?: Json | null
          retry_count?: number | null
          started_at?: string | null
          status?: string | null
          total_chunks?: number | null
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "processing_jobs_org_id_fkey"
            columns: ["org_id"]
            isOneToOne: false
            referencedRelation: "organizations"
            referencedColumns: ["id"]
          },
        ]
      }
      professional_applications: {
        Row: {
          completeness_score: number | null
          created_at: string | null
          cv_file_name: string | null
          cv_file_path: string | null
          email_body: string | null
          email_from: string
          email_subject: string | null
          extracted_data: Json | null
          id: string
          missing_info: Json | null
          org_id: string
          professional_id: string | null
          status: string
          updated_at: string | null
        }
        Insert: {
          completeness_score?: number | null
          created_at?: string | null
          cv_file_name?: string | null
          cv_file_path?: string | null
          email_body?: string | null
          email_from: string
          email_subject?: string | null
          extracted_data?: Json | null
          id?: string
          missing_info?: Json | null
          org_id: string
          professional_id?: string | null
          status?: string
          updated_at?: string | null
        }
        Update: {
          completeness_score?: number | null
          created_at?: string | null
          cv_file_name?: string | null
          cv_file_path?: string | null
          email_body?: string | null
          email_from?: string
          email_subject?: string | null
          extracted_data?: Json | null
          id?: string
          missing_info?: Json | null
          org_id?: string
          professional_id?: string | null
          status?: string
          updated_at?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "professional_applications_professional_id_fkey"
            columns: ["professional_id"]
            isOneToOne: false
            referencedRelation: "professionals"
            referencedColumns: ["id"]
          },
        ]
      }
      professional_availability: {
        Row: {
          created_at: string
          date: string
          id: string
          is_available: boolean
          professional_id: string
          shift: string
        }
        Insert: {
          created_at?: string
          date: string
          id?: string
          is_available?: boolean
          professional_id: string
          shift: string
        }
        Update: {
          created_at?: string
          date?: string
          id?: string
          is_available?: boolean
          professional_id?: string
          shift?: string
        }
        Relationships: [
          {
            foreignKeyName: "professional_availability_professional_id_fkey"
            columns: ["professional_id"]
            isOneToOne: false
            referencedRelation: "professionals"
            referencedColumns: ["id"]
          },
        ]
      }
      professional_clients: {
        Row: {
          client_id: string
          created_at: string
          end_date: string | null
          id: string
          is_active: boolean
          notes: string | null
          professional_id: string
          start_date: string
          updated_at: string
        }
        Insert: {
          client_id: string
          created_at?: string
          end_date?: string | null
          id?: string
          is_active?: boolean
          notes?: string | null
          professional_id: string
          start_date?: string
          updated_at?: string
        }
        Update: {
          client_id?: string
          created_at?: string
          end_date?: string | null
          id?: string
          is_active?: boolean
          notes?: string | null
          professional_id?: string
          start_date?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "professional_clients_client_id_fkey"
            columns: ["client_id"]
            isOneToOne: false
            referencedRelation: "clients"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "professional_clients_professional_id_fkey"
            columns: ["professional_id"]
            isOneToOne: false
            referencedRelation: "professionals"
            referencedColumns: ["id"]
          },
        ]
      }
      professionals: {
        Row: {
          adres: string | null
          beschikbaarheidsnotities: string | null
          big_nummer: string | null
          btw_nummer: string | null
          cao_akkoord: boolean | null
          created_at: string
          email: string | null
          full_name: string
          functie_niveau: string
          gewenst_uurloon: number | null
          heeft_auto: boolean | null
          heeft_rijbewijs: boolean | null
          id: string
          kvk_nummer: string | null
          org_id: string
          postcode: string | null
          rating: number | null
          regio: string | null
          skills: string[] | null
          status: string
          tags: string[] | null
          telefoonnummer: string | null
          updated_at: string
          vog_date: string | null
          werkvorm: string | null
          woonplaats: string | null
        }
        Insert: {
          adres?: string | null
          beschikbaarheidsnotities?: string | null
          big_nummer?: string | null
          btw_nummer?: string | null
          cao_akkoord?: boolean | null
          created_at?: string
          email?: string | null
          full_name: string
          functie_niveau: string
          gewenst_uurloon?: number | null
          heeft_auto?: boolean | null
          heeft_rijbewijs?: boolean | null
          id?: string
          kvk_nummer?: string | null
          org_id: string
          postcode?: string | null
          rating?: number | null
          regio?: string | null
          skills?: string[] | null
          status?: string
          tags?: string[] | null
          telefoonnummer?: string | null
          updated_at?: string
          vog_date?: string | null
          werkvorm?: string | null
          woonplaats?: string | null
        }
        Update: {
          adres?: string | null
          beschikbaarheidsnotities?: string | null
          big_nummer?: string | null
          btw_nummer?: string | null
          cao_akkoord?: boolean | null
          created_at?: string
          email?: string | null
          full_name?: string
          functie_niveau?: string
          gewenst_uurloon?: number | null
          heeft_auto?: boolean | null
          heeft_rijbewijs?: boolean | null
          id?: string
          kvk_nummer?: string | null
          org_id?: string
          postcode?: string | null
          rating?: number | null
          regio?: string | null
          skills?: string[] | null
          status?: string
          tags?: string[] | null
          telefoonnummer?: string | null
          updated_at?: string
          vog_date?: string | null
          werkvorm?: string | null
          woonplaats?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "professionals_org_id_fkey"
            columns: ["org_id"]
            isOneToOne: false
            referencedRelation: "organizations"
            referencedColumns: ["id"]
          },
        ]
      }
      profiles: {
        Row: {
          created_at: string
          email: string | null
          id: string
          image: string | null
          name: string | null
        }
        Insert: {
          created_at?: string
          email?: string | null
          id: string
          image?: string | null
          name?: string | null
        }
        Update: {
          created_at?: string
          email?: string | null
          id?: string
          image?: string | null
          name?: string | null
        }
        Relationships: []
      }
      projects: {
        Row: {
          created_at: string
          description: string | null
          id: string
          name: string
          org_id: string
        }
        Insert: {
          created_at?: string
          description?: string | null
          id?: string
          name: string
          org_id: string
        }
        Update: {
          created_at?: string
          description?: string | null
          id?: string
          name?: string
          org_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "projects_org_id_fkey"
            columns: ["org_id"]
            isOneToOne: false
            referencedRelation: "organizations"
            referencedColumns: ["id"]
          },
        ]
      }
      reminders: {
        Row: {
          at: string
          channel: Database["public"]["Enums"]["reminder_channel"]
          created_at: string
          id: string
          repeat_interval: string | null
          shown_at: string | null
          subtask_id: string | null
          task_id: string
          title: string | null
        }
        Insert: {
          at: string
          channel?: Database["public"]["Enums"]["reminder_channel"]
          created_at?: string
          id?: string
          repeat_interval?: string | null
          shown_at?: string | null
          subtask_id?: string | null
          task_id: string
          title?: string | null
        }
        Update: {
          at?: string
          channel?: Database["public"]["Enums"]["reminder_channel"]
          created_at?: string
          id?: string
          repeat_interval?: string | null
          shown_at?: string | null
          subtask_id?: string | null
          task_id?: string
          title?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "reminders_subtask_id_fkey"
            columns: ["subtask_id"]
            isOneToOne: false
            referencedRelation: "subtasks"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "reminders_task_id_fkey"
            columns: ["task_id"]
            isOneToOne: false
            referencedRelation: "tasks"
            referencedColumns: ["id"]
          },
        ]
      }
      scheduler_runs: {
        Row: {
          duration_ms: number | null
          error: string | null
          id: string
          org_id: string
          results: Json | null
          run_at: string
          triggered_functions: Json
        }
        Insert: {
          duration_ms?: number | null
          error?: string | null
          id?: string
          org_id?: string
          results?: Json | null
          run_at?: string
          triggered_functions?: Json
        }
        Update: {
          duration_ms?: number | null
          error?: string | null
          id?: string
          org_id?: string
          results?: Json | null
          run_at?: string
          triggered_functions?: Json
        }
        Relationships: []
      }
      share_links: {
        Row: {
          can_comment: boolean
          created_at: string
          id: string
          project_id: string | null
          task_id: string | null
          token: string
        }
        Insert: {
          can_comment?: boolean
          created_at?: string
          id?: string
          project_id?: string | null
          task_id?: string | null
          token: string
        }
        Update: {
          can_comment?: boolean
          created_at?: string
          id?: string
          project_id?: string | null
          task_id?: string | null
          token?: string
        }
        Relationships: [
          {
            foreignKeyName: "share_links_project_id_fkey"
            columns: ["project_id"]
            isOneToOne: false
            referencedRelation: "projects"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "share_links_task_id_fkey"
            columns: ["task_id"]
            isOneToOne: false
            referencedRelation: "tasks"
            referencedColumns: ["id"]
          },
        ]
      }
      subtasks: {
        Row: {
          assignee_id: string | null
          created_at: string
          depends_on_subtask_id: string | null
          due_at: string | null
          id: string
          order: number
          status: Database["public"]["Enums"]["subtask_status"]
          task_id: string
          title: string
        }
        Insert: {
          assignee_id?: string | null
          created_at?: string
          depends_on_subtask_id?: string | null
          due_at?: string | null
          id?: string
          order: number
          status?: Database["public"]["Enums"]["subtask_status"]
          task_id: string
          title: string
        }
        Update: {
          assignee_id?: string | null
          created_at?: string
          depends_on_subtask_id?: string | null
          due_at?: string | null
          id?: string
          order?: number
          status?: Database["public"]["Enums"]["subtask_status"]
          task_id?: string
          title?: string
        }
        Relationships: [
          {
            foreignKeyName: "subtasks_assignee_id_fkey"
            columns: ["assignee_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "subtasks_depends_on_subtask_id_fkey"
            columns: ["depends_on_subtask_id"]
            isOneToOne: false
            referencedRelation: "subtasks"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "subtasks_task_id_fkey"
            columns: ["task_id"]
            isOneToOne: false
            referencedRelation: "tasks"
            referencedColumns: ["id"]
          },
        ]
      }
      tags: {
        Row: {
          color: string
          created_at: string
          id: string
          name: string
        }
        Insert: {
          color: string
          created_at?: string
          id?: string
          name: string
        }
        Update: {
          color?: string
          created_at?: string
          id?: string
          name?: string
        }
        Relationships: []
      }
      tags_on_tasks: {
        Row: {
          tag_id: string
          task_id: string
        }
        Insert: {
          tag_id: string
          task_id: string
        }
        Update: {
          tag_id?: string
          task_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "tags_on_tasks_tag_id_fkey"
            columns: ["tag_id"]
            isOneToOne: false
            referencedRelation: "tags"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "tags_on_tasks_task_id_fkey"
            columns: ["task_id"]
            isOneToOne: false
            referencedRelation: "tasks"
            referencedColumns: ["id"]
          },
        ]
      }
      task_feedback_events: {
        Row: {
          components: Json
          created_at: string
          decision: Json
          id: string
          outcome: Json
          segment: Json
          task_id: string
        }
        Insert: {
          components?: Json
          created_at?: string
          decision?: Json
          id?: string
          outcome?: Json
          segment?: Json
          task_id: string
        }
        Update: {
          components?: Json
          created_at?: string
          decision?: Json
          id?: string
          outcome?: Json
          segment?: Json
          task_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "task_feedback_events_task_id_fkey"
            columns: ["task_id"]
            isOneToOne: false
            referencedRelation: "tasks"
            referencedColumns: ["id"]
          },
        ]
      }
      task_scoring_metadata: {
        Row: {
          business_impact_score: number | null
          complexity_score: number | null
          created_at: string
          estimated_value_eur: number | null
          id: string
          market_demand_factor: number | null
          task_id: string
          updated_at: string
        }
        Insert: {
          business_impact_score?: number | null
          complexity_score?: number | null
          created_at?: string
          estimated_value_eur?: number | null
          id?: string
          market_demand_factor?: number | null
          task_id: string
          updated_at?: string
        }
        Update: {
          business_impact_score?: number | null
          complexity_score?: number | null
          created_at?: string
          estimated_value_eur?: number | null
          id?: string
          market_demand_factor?: number | null
          task_id?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "task_scoring_metadata_task_id_fkey"
            columns: ["task_id"]
            isOneToOne: true
            referencedRelation: "tasks"
            referencedColumns: ["id"]
          },
        ]
      }
      tasks: {
        Row: {
          accepted_at: string | null
          accepted_by: string | null
          assignee_id: string | null
          category: string | null
          client_id: string | null
          column_id: string | null
          completed_at: string | null
          created_at: string
          deleted_at: string | null
          deleted_by: string | null
          description: string | null
          due_at: string | null
          estimate_min: number | null
          estimated_hours: number | null
          forecast_metadata: Json | null
          id: string
          is_all_day: boolean
          is_forecast: boolean | null
          next_action: string | null
          order_key: string
          org_id: string
          priority: Database["public"]["Enums"]["priority"]
          project_id: string | null
          reporter_id: string | null
          revenue_impact_eur: number | null
          sequence_number: number | null
          start_at: string | null
          status: string | null
          title: string
          transition_related: boolean | null
          updated_at: string
        }
        Insert: {
          accepted_at?: string | null
          accepted_by?: string | null
          assignee_id?: string | null
          category?: string | null
          client_id?: string | null
          column_id?: string | null
          completed_at?: string | null
          created_at?: string
          deleted_at?: string | null
          deleted_by?: string | null
          description?: string | null
          due_at?: string | null
          estimate_min?: number | null
          estimated_hours?: number | null
          forecast_metadata?: Json | null
          id?: string
          is_all_day?: boolean
          is_forecast?: boolean | null
          next_action?: string | null
          order_key?: string
          org_id: string
          priority?: Database["public"]["Enums"]["priority"]
          project_id?: string | null
          reporter_id?: string | null
          revenue_impact_eur?: number | null
          sequence_number?: number | null
          start_at?: string | null
          status?: string | null
          title: string
          transition_related?: boolean | null
          updated_at?: string
        }
        Update: {
          accepted_at?: string | null
          accepted_by?: string | null
          assignee_id?: string | null
          category?: string | null
          client_id?: string | null
          column_id?: string | null
          completed_at?: string | null
          created_at?: string
          deleted_at?: string | null
          deleted_by?: string | null
          description?: string | null
          due_at?: string | null
          estimate_min?: number | null
          estimated_hours?: number | null
          forecast_metadata?: Json | null
          id?: string
          is_all_day?: boolean
          is_forecast?: boolean | null
          next_action?: string | null
          order_key?: string
          org_id?: string
          priority?: Database["public"]["Enums"]["priority"]
          project_id?: string | null
          reporter_id?: string | null
          revenue_impact_eur?: number | null
          sequence_number?: number | null
          start_at?: string | null
          status?: string | null
          title?: string
          transition_related?: boolean | null
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "tasks_assignee_id_fkey"
            columns: ["assignee_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "tasks_client_id_fkey"
            columns: ["client_id"]
            isOneToOne: false
            referencedRelation: "clients"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "tasks_column_id_fkey"
            columns: ["column_id"]
            isOneToOne: false
            referencedRelation: "columns"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "tasks_org_id_fkey"
            columns: ["org_id"]
            isOneToOne: false
            referencedRelation: "organizations"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "tasks_project_id_fkey"
            columns: ["project_id"]
            isOneToOne: false
            referencedRelation: "projects"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "tasks_reporter_id_fkey"
            columns: ["reporter_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
        ]
      }
      time_entries: {
        Row: {
          created_at: string
          duration_min: number | null
          end: string | null
          id: string
          note: string | null
          start: string
          task_id: string
          user_id: string
        }
        Insert: {
          created_at?: string
          duration_min?: number | null
          end?: string | null
          id?: string
          note?: string | null
          start: string
          task_id: string
          user_id: string
        }
        Update: {
          created_at?: string
          duration_min?: number | null
          end?: string | null
          id?: string
          note?: string | null
          start?: string
          task_id?: string
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "time_entries_task_id_fkey"
            columns: ["task_id"]
            isOneToOne: false
            referencedRelation: "tasks"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "time_entries_user_id_fkey"
            columns: ["user_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
        ]
      }
      training_documents: {
        Row: {
          created_at: string | null
          error_message: string | null
          extracted_knowledge_count: number | null
          file_name: string
          file_path: string
          file_size: number
          id: string
          last_validation_error: string | null
          mime_type: string
          org_id: string
          original_folder: string | null
          processed_at: string | null
          processing_method: string | null
          processing_progress: number | null
          relative_path: string | null
          status: string
          updated_at: string | null
          user_id: string
        }
        Insert: {
          created_at?: string | null
          error_message?: string | null
          extracted_knowledge_count?: number | null
          file_name: string
          file_path: string
          file_size: number
          id?: string
          last_validation_error?: string | null
          mime_type: string
          org_id: string
          original_folder?: string | null
          processed_at?: string | null
          processing_method?: string | null
          processing_progress?: number | null
          relative_path?: string | null
          status?: string
          updated_at?: string | null
          user_id: string
        }
        Update: {
          created_at?: string | null
          error_message?: string | null
          extracted_knowledge_count?: number | null
          file_name?: string
          file_path?: string
          file_size?: number
          id?: string
          last_validation_error?: string | null
          mime_type?: string
          org_id?: string
          original_folder?: string | null
          processed_at?: string | null
          processing_method?: string | null
          processing_progress?: number | null
          relative_path?: string | null
          status?: string
          updated_at?: string | null
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "training_documents_org_id_fkey"
            columns: ["org_id"]
            isOneToOne: false
            referencedRelation: "organizations"
            referencedColumns: ["id"]
          },
        ]
      }
      user_organizations: {
        Row: {
          org_id: string
          role: Database["public"]["Enums"]["user_role"]
          user_id: string
        }
        Insert: {
          org_id: string
          role?: Database["public"]["Enums"]["user_role"]
          user_id: string
        }
        Update: {
          org_id?: string
          role?: Database["public"]["Enums"]["user_role"]
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "user_organizations_org_id_fkey"
            columns: ["org_id"]
            isOneToOne: false
            referencedRelation: "organizations"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "user_organizations_user_id_fkey"
            columns: ["user_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
        ]
      }
      user_roles: {
        Row: {
          granted_at: string | null
          granted_by: string | null
          id: string
          role: Database["public"]["Enums"]["app_role"]
          user_id: string
        }
        Insert: {
          granted_at?: string | null
          granted_by?: string | null
          id?: string
          role: Database["public"]["Enums"]["app_role"]
          user_id: string
        }
        Update: {
          granted_at?: string | null
          granted_by?: string | null
          id?: string
          role?: Database["public"]["Enums"]["app_role"]
          user_id?: string
        }
        Relationships: []
      }
      watches: {
        Row: {
          created_at: string
          id: string
          task_id: string
          user_id: string
        }
        Insert: {
          created_at?: string
          id?: string
          task_id: string
          user_id: string
        }
        Update: {
          created_at?: string
          id?: string
          task_id?: string
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "watches_task_id_fkey"
            columns: ["task_id"]
            isOneToOne: false
            referencedRelation: "tasks"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "watches_user_id_fkey"
            columns: ["user_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
        ]
      }
    }
    Views: {
      autonomous_system_status: {
        Row: {
          component: string | null
          items_generated: number | null
          items_last_24h: number | null
          last_run: string | null
        }
        Relationships: []
      }
    }
    Functions: {
      binary_quantize: {
        Args: { "": string } | { "": unknown }
        Returns: unknown
      }
      get_relevant_categories: {
        Args: { org_id_param?: string; user_question: string }
        Returns: {
          category_name: string
          confidence: number
        }[]
      }
      halfvec_avg: {
        Args: { "": number[] }
        Returns: unknown
      }
      halfvec_out: {
        Args: { "": unknown }
        Returns: unknown
      }
      halfvec_send: {
        Args: { "": unknown }
        Returns: string
      }
      halfvec_typmod_in: {
        Args: { "": unknown[] }
        Returns: number
      }
      has_acl_access: {
        Args: { _acl: Json; _user_id: string }
        Returns: boolean
      }
      has_role: {
        Args: {
          _role: Database["public"]["Enums"]["app_role"]
          _user_id: string
        }
        Returns: boolean
      }
      hnsw_bit_support: {
        Args: { "": unknown }
        Returns: unknown
      }
      hnsw_halfvec_support: {
        Args: { "": unknown }
        Returns: unknown
      }
      hnsw_sparsevec_support: {
        Args: { "": unknown }
        Returns: unknown
      }
      hnswhandler: {
        Args: { "": unknown }
        Returns: unknown
      }
      is_knowledge_valid: {
        Args: { _valid_from: string; _valid_to: string }
        Returns: boolean
      }
      ivfflat_bit_support: {
        Args: { "": unknown }
        Returns: unknown
      }
      ivfflat_halfvec_support: {
        Args: { "": unknown }
        Returns: unknown
      }
      ivfflathandler: {
        Args: { "": unknown }
        Returns: unknown
      }
      l2_norm: {
        Args: { "": unknown } | { "": unknown }
        Returns: number
      }
      l2_normalize: {
        Args: { "": string } | { "": unknown } | { "": unknown }
        Returns: unknown
      }
      match_knowledge: {
        Args:
          | {
              filter_customer_id?: string
              filter_jurisdiction?: string
              filter_org_id?: string
              filter_role_tags?: string[]
              match_count?: number
              match_threshold?: number
              query_embedding: string
            }
          | {
              filter_org_id?: string
              match_count?: number
              match_threshold?: number
              query_embedding: string
            }
        Returns: {
          category: string
          confidence_score: number
          key: string
          knowledge_id: string
          role_tags: string[]
          similarity: number
          valid_from: string
          valid_to: string
          value: Json
        }[]
      }
      redact_pii: {
        Args: { input_text: string }
        Returns: string
      }
      sparsevec_out: {
        Args: { "": unknown }
        Returns: unknown
      }
      sparsevec_send: {
        Args: { "": unknown }
        Returns: string
      }
      sparsevec_typmod_in: {
        Args: { "": unknown[] }
        Returns: number
      }
      user_is_org_member: {
        Args: { _org_id: string; _user_id: string }
        Returns: boolean
      }
      vector_avg: {
        Args: { "": number[] }
        Returns: string
      }
      vector_dims: {
        Args: { "": string } | { "": unknown }
        Returns: number
      }
      vector_norm: {
        Args: { "": string }
        Returns: number
      }
      vector_out: {
        Args: { "": string }
        Returns: unknown
      }
      vector_send: {
        Args: { "": string }
        Returns: string
      }
      vector_typmod_in: {
        Args: { "": unknown[] }
        Returns: number
      }
    }
    Enums: {
      app_role: "admin" | "manager" | "user"
      confidentiality_level: "intern" | "vertrouwelijk"
      dependency_type: "BLOCKS" | "RELATES" | "DUPLICATE"
      priority: "LOW" | "MEDIUM" | "HIGH" | "CRITICAL"
      reminder_channel: "IN_APP" | "EMAIL"
      subtask_status: "pending" | "active" | "completed" | "skipped"
      task_status: "BACKLOG" | "READY" | "DOING" | "BLOCKED" | "REVIEW" | "DONE"
      user_role: "OWNER" | "ADMIN" | "MEMBER" | "GUEST"
    }
    CompositeTypes: {
      [_ in never]: never
    }
  }
}

type DatabaseWithoutInternals = Omit<Database, "__InternalSupabase">

type DefaultSchema = DatabaseWithoutInternals[Extract<keyof Database, "public">]

export type Tables<
  DefaultSchemaTableNameOrOptions extends
    | keyof (DefaultSchema["Tables"] & DefaultSchema["Views"])
    | { schema: keyof DatabaseWithoutInternals },
  TableName extends DefaultSchemaTableNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof (DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"] &
        DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Views"])
    : never = never,
> = DefaultSchemaTableNameOrOptions extends {
  schema: keyof DatabaseWithoutInternals
}
  ? (DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"] &
      DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Views"])[TableName] extends {
      Row: infer R
    }
    ? R
    : never
  : DefaultSchemaTableNameOrOptions extends keyof (DefaultSchema["Tables"] &
        DefaultSchema["Views"])
    ? (DefaultSchema["Tables"] &
        DefaultSchema["Views"])[DefaultSchemaTableNameOrOptions] extends {
        Row: infer R
      }
      ? R
      : never
    : never

export type TablesInsert<
  DefaultSchemaTableNameOrOptions extends
    | keyof DefaultSchema["Tables"]
    | { schema: keyof DatabaseWithoutInternals },
  TableName extends DefaultSchemaTableNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"]
    : never = never,
> = DefaultSchemaTableNameOrOptions extends {
  schema: keyof DatabaseWithoutInternals
}
  ? DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"][TableName] extends {
      Insert: infer I
    }
    ? I
    : never
  : DefaultSchemaTableNameOrOptions extends keyof DefaultSchema["Tables"]
    ? DefaultSchema["Tables"][DefaultSchemaTableNameOrOptions] extends {
        Insert: infer I
      }
      ? I
      : never
    : never

export type TablesUpdate<
  DefaultSchemaTableNameOrOptions extends
    | keyof DefaultSchema["Tables"]
    | { schema: keyof DatabaseWithoutInternals },
  TableName extends DefaultSchemaTableNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"]
    : never = never,
> = DefaultSchemaTableNameOrOptions extends {
  schema: keyof DatabaseWithoutInternals
}
  ? DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"][TableName] extends {
      Update: infer U
    }
    ? U
    : never
  : DefaultSchemaTableNameOrOptions extends keyof DefaultSchema["Tables"]
    ? DefaultSchema["Tables"][DefaultSchemaTableNameOrOptions] extends {
        Update: infer U
      }
      ? U
      : never
    : never

export type Enums<
  DefaultSchemaEnumNameOrOptions extends
    | keyof DefaultSchema["Enums"]
    | { schema: keyof DatabaseWithoutInternals },
  EnumName extends DefaultSchemaEnumNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof DatabaseWithoutInternals[DefaultSchemaEnumNameOrOptions["schema"]]["Enums"]
    : never = never,
> = DefaultSchemaEnumNameOrOptions extends {
  schema: keyof DatabaseWithoutInternals
}
  ? DatabaseWithoutInternals[DefaultSchemaEnumNameOrOptions["schema"]]["Enums"][EnumName]
  : DefaultSchemaEnumNameOrOptions extends keyof DefaultSchema["Enums"]
    ? DefaultSchema["Enums"][DefaultSchemaEnumNameOrOptions]
    : never

export type CompositeTypes<
  PublicCompositeTypeNameOrOptions extends
    | keyof DefaultSchema["CompositeTypes"]
    | { schema: keyof DatabaseWithoutInternals },
  CompositeTypeName extends PublicCompositeTypeNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof DatabaseWithoutInternals[PublicCompositeTypeNameOrOptions["schema"]]["CompositeTypes"]
    : never = never,
> = PublicCompositeTypeNameOrOptions extends {
  schema: keyof DatabaseWithoutInternals
}
  ? DatabaseWithoutInternals[PublicCompositeTypeNameOrOptions["schema"]]["CompositeTypes"][CompositeTypeName]
  : PublicCompositeTypeNameOrOptions extends keyof DefaultSchema["CompositeTypes"]
    ? DefaultSchema["CompositeTypes"][PublicCompositeTypeNameOrOptions]
    : never

export const Constants = {
  public: {
    Enums: {
      app_role: ["admin", "manager", "user"],
      confidentiality_level: ["intern", "vertrouwelijk"],
      dependency_type: ["BLOCKS", "RELATES", "DUPLICATE"],
      priority: ["LOW", "MEDIUM", "HIGH", "CRITICAL"],
      reminder_channel: ["IN_APP", "EMAIL"],
      subtask_status: ["pending", "active", "completed", "skipped"],
      task_status: ["BACKLOG", "READY", "DOING", "BLOCKED", "REVIEW", "DONE"],
      user_role: ["OWNER", "ADMIN", "MEMBER", "GUEST"],
    },
  },
} as const
