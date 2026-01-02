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
      agent_actions: {
        Row: {
          action_description: string | null
          action_order: number
          action_type: string
          callback_received: boolean | null
          completed_at: string | null
          created_at: string
          error_message: string | null
          external_id: string | null
          goal_id: string
          id: string
          input_data: Json | null
          max_retries: number | null
          output_data: Json | null
          retry_count: number | null
          scheduled_at: string | null
          started_at: string | null
          status: string
          updated_at: string
          webhook_url: string | null
        }
        Insert: {
          action_description?: string | null
          action_order?: number
          action_type: string
          callback_received?: boolean | null
          completed_at?: string | null
          created_at?: string
          error_message?: string | null
          external_id?: string | null
          goal_id: string
          id?: string
          input_data?: Json | null
          max_retries?: number | null
          output_data?: Json | null
          retry_count?: number | null
          scheduled_at?: string | null
          started_at?: string | null
          status?: string
          updated_at?: string
          webhook_url?: string | null
        }
        Update: {
          action_description?: string | null
          action_order?: number
          action_type?: string
          callback_received?: boolean | null
          completed_at?: string | null
          created_at?: string
          error_message?: string | null
          external_id?: string | null
          goal_id?: string
          id?: string
          input_data?: Json | null
          max_retries?: number | null
          output_data?: Json | null
          retry_count?: number | null
          scheduled_at?: string | null
          started_at?: string | null
          status?: string
          updated_at?: string
          webhook_url?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "agent_actions_goal_id_fkey"
            columns: ["goal_id"]
            isOneToOne: false
            referencedRelation: "agent_goals"
            referencedColumns: ["id"]
          },
        ]
      }
      agent_goals: {
        Row: {
          completed_at: string | null
          created_at: string
          deadline: string | null
          goal_description: string
          goal_type: string
          id: string
          input_data: Json | null
          learnings: Json | null
          org_id: string
          output_data: Json | null
          plan: Json | null
          priority: number
          started_at: string | null
          status: string
          success_score: number | null
          trigger_event: Json | null
          updated_at: string
          user_id: string | null
        }
        Insert: {
          completed_at?: string | null
          created_at?: string
          deadline?: string | null
          goal_description: string
          goal_type: string
          id?: string
          input_data?: Json | null
          learnings?: Json | null
          org_id: string
          output_data?: Json | null
          plan?: Json | null
          priority?: number
          started_at?: string | null
          status?: string
          success_score?: number | null
          trigger_event?: Json | null
          updated_at?: string
          user_id?: string | null
        }
        Update: {
          completed_at?: string | null
          created_at?: string
          deadline?: string | null
          goal_description?: string
          goal_type?: string
          id?: string
          input_data?: Json | null
          learnings?: Json | null
          org_id?: string
          output_data?: Json | null
          plan?: Json | null
          priority?: number
          started_at?: string | null
          status?: string
          success_score?: number | null
          trigger_event?: Json | null
          updated_at?: string
          user_id?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "agent_goals_org_id_fkey"
            columns: ["org_id"]
            isOneToOne: false
            referencedRelation: "organizations"
            referencedColumns: ["id"]
          },
        ]
      }
      agent_task_queue: {
        Row: {
          action_id: string | null
          attempt_count: number | null
          created_at: string
          error_message: string | null
          execute_after: string | null
          execution_data: Json | null
          goal_id: string | null
          id: string
          locked_by: string | null
          locked_until: string | null
          max_attempts: number | null
          priority: number
          processed_at: string | null
          result_data: Json | null
          scheduled_at: string
          status: string
          task_type: string
        }
        Insert: {
          action_id?: string | null
          attempt_count?: number | null
          created_at?: string
          error_message?: string | null
          execute_after?: string | null
          execution_data?: Json | null
          goal_id?: string | null
          id?: string
          locked_by?: string | null
          locked_until?: string | null
          max_attempts?: number | null
          priority?: number
          processed_at?: string | null
          result_data?: Json | null
          scheduled_at?: string
          status?: string
          task_type: string
        }
        Update: {
          action_id?: string | null
          attempt_count?: number | null
          created_at?: string
          error_message?: string | null
          execute_after?: string | null
          execution_data?: Json | null
          goal_id?: string | null
          id?: string
          locked_by?: string | null
          locked_until?: string | null
          max_attempts?: number | null
          priority?: number
          processed_at?: string | null
          result_data?: Json | null
          scheduled_at?: string
          status?: string
          task_type?: string
        }
        Relationships: [
          {
            foreignKeyName: "agent_task_queue_action_id_fkey"
            columns: ["action_id"]
            isOneToOne: false
            referencedRelation: "agent_actions"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "agent_task_queue_goal_id_fkey"
            columns: ["goal_id"]
            isOneToOne: false
            referencedRelation: "agent_goals"
            referencedColumns: ["id"]
          },
        ]
      }
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
      ai_chat_feedback: {
        Row: {
          created_at: string
          feedback_type: string
          id: string
          knowledge_ids: string[] | null
          message_id: string
          user_id: string
        }
        Insert: {
          created_at?: string
          feedback_type: string
          id?: string
          knowledge_ids?: string[] | null
          message_id: string
          user_id: string
        }
        Update: {
          created_at?: string
          feedback_type?: string
          id?: string
          knowledge_ids?: string[] | null
          message_id?: string
          user_id?: string
        }
        Relationships: []
      }
      ai_chat_messages: {
        Row: {
          confidence_score: number | null
          content: string
          conversation_id: string | null
          created_at: string
          id: string
          message_id: string
          org_id: string
          role: string
          used_knowledge: Json | null
          user_id: string
        }
        Insert: {
          confidence_score?: number | null
          content: string
          conversation_id?: string | null
          created_at?: string
          id?: string
          message_id?: string
          org_id: string
          role: string
          used_knowledge?: Json | null
          user_id: string
        }
        Update: {
          confidence_score?: number | null
          content?: string
          conversation_id?: string | null
          created_at?: string
          id?: string
          message_id?: string
          org_id?: string
          role?: string
          used_knowledge?: Json | null
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "ai_chat_messages_org_id_fkey"
            columns: ["org_id"]
            isOneToOne: false
            referencedRelation: "organizations"
            referencedColumns: ["id"]
          },
        ]
      }
      ai_chat_test_results: {
        Row: {
          actual_tool_used: string | null
          created_at: string | null
          deployment_id: string | null
          deployment_source: string | null
          error_message: string | null
          expected_tool: string | null
          id: string
          passed: boolean
          question: string
          response: string | null
          response_time_ms: number | null
          scenario_id: string
          test_run_id: string
          validation_details: Json | null
        }
        Insert: {
          actual_tool_used?: string | null
          created_at?: string | null
          deployment_id?: string | null
          deployment_source?: string | null
          error_message?: string | null
          expected_tool?: string | null
          id?: string
          passed?: boolean
          question: string
          response?: string | null
          response_time_ms?: number | null
          scenario_id: string
          test_run_id: string
          validation_details?: Json | null
        }
        Update: {
          actual_tool_used?: string | null
          created_at?: string | null
          deployment_id?: string | null
          deployment_source?: string | null
          error_message?: string | null
          expected_tool?: string | null
          id?: string
          passed?: boolean
          question?: string
          response?: string | null
          response_time_ms?: number | null
          scenario_id?: string
          test_run_id?: string
          validation_details?: Json | null
        }
        Relationships: []
      }
      ai_chat_test_runs: {
        Row: {
          alert_sent: boolean | null
          avg_response_time_ms: number | null
          completed_at: string | null
          deployment_id: string | null
          deployment_source: string | null
          failed_tests: number
          id: string
          org_id: string | null
          passed_tests: number
          started_at: string | null
          status: string
          total_tests: number
        }
        Insert: {
          alert_sent?: boolean | null
          avg_response_time_ms?: number | null
          completed_at?: string | null
          deployment_id?: string | null
          deployment_source?: string | null
          failed_tests?: number
          id?: string
          org_id?: string | null
          passed_tests?: number
          started_at?: string | null
          status?: string
          total_tests?: number
        }
        Update: {
          alert_sent?: boolean | null
          avg_response_time_ms?: number | null
          completed_at?: string | null
          deployment_id?: string | null
          deployment_source?: string | null
          failed_tests?: number
          id?: string
          org_id?: string | null
          passed_tests?: number
          started_at?: string | null
          status?: string
          total_tests?: number
        }
        Relationships: [
          {
            foreignKeyName: "ai_chat_test_runs_org_id_fkey"
            columns: ["org_id"]
            isOneToOne: false
            referencedRelation: "organizations"
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
          correction_count: number | null
          created_at: string | null
          data_freshness_days: number | null
          deleted_at: string | null
          deleted_by: string | null
          deletion_reason: Json | null
          harmful_count: number | null
          helpful_count: number | null
          id: string
          is_shared: boolean | null
          jurisdiction: string | null
          key: string
          kvk_source_data: Json | null
          last_correction: Json | null
          last_kvk_check: string | null
          last_reviewed_at: string | null
          last_source_check: string | null
          last_used_at: string | null
          last_validation_error: string | null
          last_verified: string | null
          needs_review: boolean | null
          observation_count: number | null
          occurrence_count: number | null
          org_id: string
          original_text: string | null
          redacted_text: string | null
          requires_verification: boolean | null
          retrieved_at: string | null
          review_count: number | null
          role_tags: string[] | null
          source: string | null
          source_check_failures: number | null
          source_reference: string | null
          source_status: string | null
          source_title: string | null
          source_type: string | null
          source_url: string | null
          stability_score: number | null
          temporal_context: Json | null
          training_document_id: string | null
          updated_at: string | null
          usage_count: number | null
          user_id: string | null
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
          correction_count?: number | null
          created_at?: string | null
          data_freshness_days?: number | null
          deleted_at?: string | null
          deleted_by?: string | null
          deletion_reason?: Json | null
          harmful_count?: number | null
          helpful_count?: number | null
          id?: string
          is_shared?: boolean | null
          jurisdiction?: string | null
          key: string
          kvk_source_data?: Json | null
          last_correction?: Json | null
          last_kvk_check?: string | null
          last_reviewed_at?: string | null
          last_source_check?: string | null
          last_used_at?: string | null
          last_validation_error?: string | null
          last_verified?: string | null
          needs_review?: boolean | null
          observation_count?: number | null
          occurrence_count?: number | null
          org_id: string
          original_text?: string | null
          redacted_text?: string | null
          requires_verification?: boolean | null
          retrieved_at?: string | null
          review_count?: number | null
          role_tags?: string[] | null
          source?: string | null
          source_check_failures?: number | null
          source_reference?: string | null
          source_status?: string | null
          source_title?: string | null
          source_type?: string | null
          source_url?: string | null
          stability_score?: number | null
          temporal_context?: Json | null
          training_document_id?: string | null
          updated_at?: string | null
          usage_count?: number | null
          user_id?: string | null
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
          correction_count?: number | null
          created_at?: string | null
          data_freshness_days?: number | null
          deleted_at?: string | null
          deleted_by?: string | null
          deletion_reason?: Json | null
          harmful_count?: number | null
          helpful_count?: number | null
          id?: string
          is_shared?: boolean | null
          jurisdiction?: string | null
          key?: string
          kvk_source_data?: Json | null
          last_correction?: Json | null
          last_kvk_check?: string | null
          last_reviewed_at?: string | null
          last_source_check?: string | null
          last_used_at?: string | null
          last_validation_error?: string | null
          last_verified?: string | null
          needs_review?: boolean | null
          observation_count?: number | null
          occurrence_count?: number | null
          org_id?: string
          original_text?: string | null
          redacted_text?: string | null
          requires_verification?: boolean | null
          retrieved_at?: string | null
          review_count?: number | null
          role_tags?: string[] | null
          source?: string | null
          source_check_failures?: number | null
          source_reference?: string | null
          source_status?: string | null
          source_title?: string | null
          source_type?: string | null
          source_url?: string | null
          stability_score?: number | null
          temporal_context?: Json | null
          training_document_id?: string | null
          updated_at?: string | null
          usage_count?: number | null
          user_id?: string | null
          valid_from?: string | null
          valid_to?: string | null
          validation_failures?: number | null
          validation_status?: string | null
          value?: Json
        }
        Relationships: [
          {
            foreignKeyName: "ai_knowledge_base_org_id_fkey"
            columns: ["org_id"]
            isOneToOne: false
            referencedRelation: "organizations"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "ai_knowledge_base_training_document_id_fkey"
            columns: ["training_document_id"]
            isOneToOne: false
            referencedRelation: "training_documents"
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
          user_id: string | null
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
          user_id?: string | null
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
          user_id?: string | null
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
      ai_learning_events_backup_pre_nullable: {
        Row: {
          ai_response: Json | null
          applied_to_knowledge_base: boolean | null
          confidence_score: number | null
          context: Json | null
          created_at: string | null
          event_type: string | null
          id: string | null
          learning_score: number | null
          org_id: string | null
          outcome: string | null
          user_action: Json | null
          user_id: string | null
        }
        Insert: {
          ai_response?: Json | null
          applied_to_knowledge_base?: boolean | null
          confidence_score?: number | null
          context?: Json | null
          created_at?: string | null
          event_type?: string | null
          id?: string | null
          learning_score?: number | null
          org_id?: string | null
          outcome?: string | null
          user_action?: Json | null
          user_id?: string | null
        }
        Update: {
          ai_response?: Json | null
          applied_to_knowledge_base?: boolean | null
          confidence_score?: number | null
          context?: Json | null
          created_at?: string | null
          event_type?: string | null
          id?: string | null
          learning_score?: number | null
          org_id?: string | null
          outcome?: string | null
          user_action?: Json | null
          user_id?: string | null
        }
        Relationships: []
      }
      ai_meta_patterns: {
        Row: {
          applied_at: string | null
          confidence: number | null
          created_at: string | null
          id: string
          items_affected: number | null
          last_applied_at: string | null
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
          items_affected?: number | null
          last_applied_at?: string | null
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
          items_affected?: number | null
          last_applied_at?: string | null
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
      ai_recommendation_audit: {
        Row: {
          action_taken_at: string | null
          ai_confidence: number | null
          created_at: string
          entity_id: string | null
          entity_type: string
          id: string
          match_score: number | null
          org_id: string
          recommendation_data: Json
          recommendation_type: string
          user_action: string | null
          user_id: string | null
        }
        Insert: {
          action_taken_at?: string | null
          ai_confidence?: number | null
          created_at?: string
          entity_id?: string | null
          entity_type: string
          id?: string
          match_score?: number | null
          org_id: string
          recommendation_data?: Json
          recommendation_type: string
          user_action?: string | null
          user_id?: string | null
        }
        Update: {
          action_taken_at?: string | null
          ai_confidence?: number | null
          created_at?: string
          entity_id?: string | null
          entity_type?: string
          id?: string
          match_score?: number | null
          org_id?: string
          recommendation_data?: Json
          recommendation_type?: string
          user_action?: string | null
          user_id?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "ai_recommendation_audit_org_id_fkey"
            columns: ["org_id"]
            isOneToOne: false
            referencedRelation: "organizations"
            referencedColumns: ["id"]
          },
        ]
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
      application_documents: {
        Row: {
          application_id: string
          category: string | null
          content_type: string | null
          created_at: string | null
          document_type: string | null
          escalated_at: string | null
          escalation_level: number | null
          expiry_date: string | null
          file_path: string
          filename: string
          id: string
          is_verified: boolean | null
          metadata: Json | null
          recruiter_notified_at: string | null
          reminder_sent_at: string | null
          source: string | null
          verified_at: string | null
          verified_by: string | null
          vog_expiry_status: string | null
          vog_issue_date: string | null
        }
        Insert: {
          application_id: string
          category?: string | null
          content_type?: string | null
          created_at?: string | null
          document_type?: string | null
          escalated_at?: string | null
          escalation_level?: number | null
          expiry_date?: string | null
          file_path: string
          filename: string
          id?: string
          is_verified?: boolean | null
          metadata?: Json | null
          recruiter_notified_at?: string | null
          reminder_sent_at?: string | null
          source?: string | null
          verified_at?: string | null
          verified_by?: string | null
          vog_expiry_status?: string | null
          vog_issue_date?: string | null
        }
        Update: {
          application_id?: string
          category?: string | null
          content_type?: string | null
          created_at?: string | null
          document_type?: string | null
          escalated_at?: string | null
          escalation_level?: number | null
          expiry_date?: string | null
          file_path?: string
          filename?: string
          id?: string
          is_verified?: boolean | null
          metadata?: Json | null
          recruiter_notified_at?: string | null
          reminder_sent_at?: string | null
          source?: string | null
          verified_at?: string | null
          verified_by?: string | null
          vog_expiry_status?: string | null
          vog_issue_date?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "application_documents_application_id_fkey"
            columns: ["application_id"]
            isOneToOne: false
            referencedRelation: "professional_applications"
            referencedColumns: ["id"]
          },
        ]
      }
      application_notes: {
        Row: {
          application_id: string
          content: string
          created_at: string | null
          id: string
          is_pinned: boolean | null
          updated_at: string | null
          user_id: string
        }
        Insert: {
          application_id: string
          content: string
          created_at?: string | null
          id?: string
          is_pinned?: boolean | null
          updated_at?: string | null
          user_id: string
        }
        Update: {
          application_id?: string
          content?: string
          created_at?: string | null
          id?: string
          is_pinned?: boolean | null
          updated_at?: string | null
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "application_notes_application_id_fkey"
            columns: ["application_id"]
            isOneToOne: false
            referencedRelation: "professional_applications"
            referencedColumns: ["id"]
          },
        ]
      }
      application_stage_audit: {
        Row: {
          application_id: string
          from_stage: string | null
          id: string
          metadata: Json | null
          performed_at: string | null
          performed_by: string | null
          reason: string | null
          to_stage: string
        }
        Insert: {
          application_id: string
          from_stage?: string | null
          id?: string
          metadata?: Json | null
          performed_at?: string | null
          performed_by?: string | null
          reason?: string | null
          to_stage: string
        }
        Update: {
          application_id?: string
          from_stage?: string | null
          id?: string
          metadata?: Json | null
          performed_at?: string | null
          performed_by?: string | null
          reason?: string | null
          to_stage?: string
        }
        Relationships: [
          {
            foreignKeyName: "application_stage_audit_application_id_fkey"
            columns: ["application_id"]
            isOneToOne: false
            referencedRelation: "professional_applications"
            referencedColumns: ["id"]
          },
        ]
      }
      application_sublocation_matches: {
        Row: {
          application_id: string
          created_at: string | null
          created_by: string | null
          id: string
          klant_reactie: string | null
          match_reasoning: Json | null
          match_score: number
          status: string
          sublocation_id: string
          updated_at: string | null
          vacancy_id: string | null
          voorgesteld_aan_klant_at: string | null
        }
        Insert: {
          application_id: string
          created_at?: string | null
          created_by?: string | null
          id?: string
          klant_reactie?: string | null
          match_reasoning?: Json | null
          match_score: number
          status?: string
          sublocation_id: string
          updated_at?: string | null
          vacancy_id?: string | null
          voorgesteld_aan_klant_at?: string | null
        }
        Update: {
          application_id?: string
          created_at?: string | null
          created_by?: string | null
          id?: string
          klant_reactie?: string | null
          match_reasoning?: Json | null
          match_score?: number
          status?: string
          sublocation_id?: string
          updated_at?: string | null
          vacancy_id?: string | null
          voorgesteld_aan_klant_at?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "application_sublocation_matches_application_id_fkey"
            columns: ["application_id"]
            isOneToOne: false
            referencedRelation: "professional_applications"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "application_sublocation_matches_sublocation_id_fkey"
            columns: ["sublocation_id"]
            isOneToOne: false
            referencedRelation: "client_sublocations"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "application_sublocation_matches_vacancy_id_fkey"
            columns: ["vacancy_id"]
            isOneToOne: false
            referencedRelation: "vacancies"
            referencedColumns: ["id"]
          },
        ]
      }
      assignment_evaluations: {
        Row: {
          assignment_id: string
          created_at: string
          evaluator_id: string | null
          feedback: string | null
          id: string
          rating: number
          would_rehire: boolean | null
        }
        Insert: {
          assignment_id: string
          created_at?: string
          evaluator_id?: string | null
          feedback?: string | null
          id?: string
          rating: number
          would_rehire?: boolean | null
        }
        Update: {
          assignment_id?: string
          created_at?: string
          evaluator_id?: string | null
          feedback?: string | null
          id?: string
          rating?: number
          would_rehire?: boolean | null
        }
        Relationships: [
          {
            foreignKeyName: "assignment_evaluations_assignment_id_fkey"
            columns: ["assignment_id"]
            isOneToOne: true
            referencedRelation: "assignment_details"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "assignment_evaluations_assignment_id_fkey"
            columns: ["assignment_id"]
            isOneToOne: true
            referencedRelation: "assignments"
            referencedColumns: ["id"]
          },
        ]
      }
      assignments: {
        Row: {
          ai_match_reasoning: Json | null
          ai_match_score: number | null
          completed_at: string | null
          created_at: string
          created_by: string | null
          end_date: string | null
          hourly_rate_id: string | null
          id: string
          is_test_data: boolean | null
          notes: string | null
          plaatsing_type: string | null
          professional_id: string
          start_date: string
          status: string
          sublocation_id: string
          updated_at: string
          verwachte_einddatum: string | null
          weekly_hours: number
          werkvorm: string | null
        }
        Insert: {
          ai_match_reasoning?: Json | null
          ai_match_score?: number | null
          completed_at?: string | null
          created_at?: string
          created_by?: string | null
          end_date?: string | null
          hourly_rate_id?: string | null
          id?: string
          is_test_data?: boolean | null
          notes?: string | null
          plaatsing_type?: string | null
          professional_id: string
          start_date: string
          status?: string
          sublocation_id: string
          updated_at?: string
          verwachte_einddatum?: string | null
          weekly_hours?: number
          werkvorm?: string | null
        }
        Update: {
          ai_match_reasoning?: Json | null
          ai_match_score?: number | null
          completed_at?: string | null
          created_at?: string
          created_by?: string | null
          end_date?: string | null
          hourly_rate_id?: string | null
          id?: string
          is_test_data?: boolean | null
          notes?: string | null
          plaatsing_type?: string | null
          professional_id?: string
          start_date?: string
          status?: string
          sublocation_id?: string
          updated_at?: string
          verwachte_einddatum?: string | null
          weekly_hours?: number
          werkvorm?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "assignments_hourly_rate_id_fkey"
            columns: ["hourly_rate_id"]
            isOneToOne: false
            referencedRelation: "hourly_rates"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "assignments_professional_id_fkey"
            columns: ["professional_id"]
            isOneToOne: false
            referencedRelation: "professionals"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "assignments_professional_id_fkey"
            columns: ["professional_id"]
            isOneToOne: false
            referencedRelation: "professionals_admin_view"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "assignments_professional_id_fkey"
            columns: ["professional_id"]
            isOneToOne: false
            referencedRelation: "professionals_public"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "assignments_sublocation_id_fkey"
            columns: ["sublocation_id"]
            isOneToOne: false
            referencedRelation: "client_sublocations"
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
      category_suggestions: {
        Row: {
          confidence: number | null
          created_at: string | null
          example_key: string | null
          id: string
          org_id: string
          reasoning: string | null
          reviewed_at: string | null
          reviewed_by: string | null
          status: string | null
          suggested_category: string
        }
        Insert: {
          confidence?: number | null
          created_at?: string | null
          example_key?: string | null
          id?: string
          org_id: string
          reasoning?: string | null
          reviewed_at?: string | null
          reviewed_by?: string | null
          status?: string | null
          suggested_category: string
        }
        Update: {
          confidence?: number | null
          created_at?: string | null
          example_key?: string | null
          id?: string
          org_id?: string
          reasoning?: string | null
          reviewed_at?: string | null
          reviewed_by?: string | null
          status?: string | null
          suggested_category?: string
        }
        Relationships: [
          {
            foreignKeyName: "category_suggestions_org_id_fkey"
            columns: ["org_id"]
            isOneToOne: false
            referencedRelation: "organizations"
            referencedColumns: ["id"]
          },
        ]
      }
      chat_messages_old_backup: {
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
      circuit_breaker_state: {
        Row: {
          created_at: string | null
          failure_count: number
          half_open_at: string | null
          id: string
          last_error_message: string | null
          last_failure_at: string | null
          last_success_at: string | null
          metadata: Json | null
          opened_at: string | null
          service_name: string
          state: string
          success_count: number
          updated_at: string | null
        }
        Insert: {
          created_at?: string | null
          failure_count?: number
          half_open_at?: string | null
          id?: string
          last_error_message?: string | null
          last_failure_at?: string | null
          last_success_at?: string | null
          metadata?: Json | null
          opened_at?: string | null
          service_name: string
          state?: string
          success_count?: number
          updated_at?: string | null
        }
        Update: {
          created_at?: string | null
          failure_count?: number
          half_open_at?: string | null
          id?: string
          last_error_message?: string | null
          last_failure_at?: string | null
          last_success_at?: string | null
          metadata?: Json | null
          opened_at?: string | null
          service_name?: string
          state?: string
          success_count?: number
          updated_at?: string | null
        }
        Relationships: []
      }
      client_expert_preferences: {
        Row: {
          created_at: string
          id: string
          min_jaren_ervaring: number | null
          notes: string | null
          organization_id: string | null
          preferred_certificaten: string[] | null
          preferred_werkstijlen: string[] | null
          required_specialismen: string[] | null
          sublocation_id: string | null
          updated_at: string
          voorkeur_werkvorm: string | null
        }
        Insert: {
          created_at?: string
          id?: string
          min_jaren_ervaring?: number | null
          notes?: string | null
          organization_id?: string | null
          preferred_certificaten?: string[] | null
          preferred_werkstijlen?: string[] | null
          required_specialismen?: string[] | null
          sublocation_id?: string | null
          updated_at?: string
          voorkeur_werkvorm?: string | null
        }
        Update: {
          created_at?: string
          id?: string
          min_jaren_ervaring?: number | null
          notes?: string | null
          organization_id?: string | null
          preferred_certificaten?: string[] | null
          preferred_werkstijlen?: string[] | null
          required_specialismen?: string[] | null
          sublocation_id?: string | null
          updated_at?: string
          voorkeur_werkvorm?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "client_expert_preferences_organization_id_fkey"
            columns: ["organization_id"]
            isOneToOne: false
            referencedRelation: "client_organizations"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "client_expert_preferences_sublocation_id_fkey"
            columns: ["sublocation_id"]
            isOneToOne: false
            referencedRelation: "client_sublocations"
            referencedColumns: ["id"]
          },
        ]
      }
      client_locations: {
        Row: {
          adres: string | null
          client_org_id: string
          contactpersoon_email: string | null
          contactpersoon_naam: string | null
          created_at: string
          crediteuren_tav: string | null
          factuur_email: string | null
          id: string
          is_active: boolean
          naam: string
          plaats: string | null
          postcode: string | null
          provincie: string | null
          telefoon: string | null
          ubl_enabled: boolean
          updated_at: string
        }
        Insert: {
          adres?: string | null
          client_org_id: string
          contactpersoon_email?: string | null
          contactpersoon_naam?: string | null
          created_at?: string
          crediteuren_tav?: string | null
          factuur_email?: string | null
          id?: string
          is_active?: boolean
          naam: string
          plaats?: string | null
          postcode?: string | null
          provincie?: string | null
          telefoon?: string | null
          ubl_enabled?: boolean
          updated_at?: string
        }
        Update: {
          adres?: string | null
          client_org_id?: string
          contactpersoon_email?: string | null
          contactpersoon_naam?: string | null
          created_at?: string
          crediteuren_tav?: string | null
          factuur_email?: string | null
          id?: string
          is_active?: boolean
          naam?: string
          plaats?: string | null
          postcode?: string | null
          provincie?: string | null
          telefoon?: string | null
          ubl_enabled?: boolean
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "client_locations_client_org_id_fkey"
            columns: ["client_org_id"]
            isOneToOne: false
            referencedRelation: "client_organizations"
            referencedColumns: ["id"]
          },
        ]
      }
      client_organizations: {
        Row: {
          btw_nummer: string | null
          centrale_facturatie_email: string | null
          created_at: string
          id: string
          kvk_nummer: string | null
          logo_url: string | null
          name: string
          notes: string | null
          org_id: string
          updated_at: string
          website: string | null
        }
        Insert: {
          btw_nummer?: string | null
          centrale_facturatie_email?: string | null
          created_at?: string
          id?: string
          kvk_nummer?: string | null
          logo_url?: string | null
          name: string
          notes?: string | null
          org_id: string
          updated_at?: string
          website?: string | null
        }
        Update: {
          btw_nummer?: string | null
          centrale_facturatie_email?: string | null
          created_at?: string
          id?: string
          kvk_nummer?: string | null
          logo_url?: string | null
          name?: string
          notes?: string | null
          org_id?: string
          updated_at?: string
          website?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "client_organizations_org_id_fkey"
            columns: ["org_id"]
            isOneToOne: false
            referencedRelation: "organizations"
            referencedColumns: ["id"]
          },
        ]
      }
      client_sublocations: {
        Row: {
          adres: string | null
          capaciteit_max: number | null
          capaciteit_min: number | null
          created_at: string
          doelgroep: string[] | null
          doelgroep_omschrijving: string | null
          factuur_via_hoofdlocatie: boolean
          gekoppelde_bv_org_id: string | null
          gezochte_functies: string[] | null
          id: string
          is_active: boolean
          kostenplaats: string | null
          leeftijd_tot: number | null
          leeftijd_van: number | null
          location_id: string
          naam: string
          plaats: string | null
          postcode: string | null
          provincie: string | null
          publieke_opmerking: string | null
          relatienummer: string | null
          sector: string[] | null
          telefoon: string | null
          updated_at: string
        }
        Insert: {
          adres?: string | null
          capaciteit_max?: number | null
          capaciteit_min?: number | null
          created_at?: string
          doelgroep?: string[] | null
          doelgroep_omschrijving?: string | null
          factuur_via_hoofdlocatie?: boolean
          gekoppelde_bv_org_id?: string | null
          gezochte_functies?: string[] | null
          id?: string
          is_active?: boolean
          kostenplaats?: string | null
          leeftijd_tot?: number | null
          leeftijd_van?: number | null
          location_id: string
          naam: string
          plaats?: string | null
          postcode?: string | null
          provincie?: string | null
          publieke_opmerking?: string | null
          relatienummer?: string | null
          sector?: string[] | null
          telefoon?: string | null
          updated_at?: string
        }
        Update: {
          adres?: string | null
          capaciteit_max?: number | null
          capaciteit_min?: number | null
          created_at?: string
          doelgroep?: string[] | null
          doelgroep_omschrijving?: string | null
          factuur_via_hoofdlocatie?: boolean
          gekoppelde_bv_org_id?: string | null
          gezochte_functies?: string[] | null
          id?: string
          is_active?: boolean
          kostenplaats?: string | null
          leeftijd_tot?: number | null
          leeftijd_van?: number | null
          location_id?: string
          naam?: string
          plaats?: string | null
          postcode?: string | null
          provincie?: string | null
          publieke_opmerking?: string | null
          relatienummer?: string | null
          sector?: string[] | null
          telefoon?: string | null
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "client_sublocations_gekoppelde_bv_org_id_fkey"
            columns: ["gekoppelde_bv_org_id"]
            isOneToOne: false
            referencedRelation: "organizations"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "client_sublocations_location_id_fkey"
            columns: ["location_id"]
            isOneToOne: false
            referencedRelation: "client_locations"
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
      data_conflicts: {
        Row: {
          conflict_type: string
          conflicting_suggestion: Json
          created_at: string
          existing_knowledge_id: string | null
          id: string
          metadata: Json | null
          org_id: string
          resolution_action: string | null
          resolution_status: string
          resolved_at: string | null
          resolved_by: string | null
          severity: string
          updated_at: string
        }
        Insert: {
          conflict_type: string
          conflicting_suggestion: Json
          created_at?: string
          existing_knowledge_id?: string | null
          id?: string
          metadata?: Json | null
          org_id: string
          resolution_action?: string | null
          resolution_status?: string
          resolved_at?: string | null
          resolved_by?: string | null
          severity: string
          updated_at?: string
        }
        Update: {
          conflict_type?: string
          conflicting_suggestion?: Json
          created_at?: string
          existing_knowledge_id?: string | null
          id?: string
          metadata?: Json | null
          org_id?: string
          resolution_action?: string | null
          resolution_status?: string
          resolved_at?: string | null
          resolved_by?: string | null
          severity?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "data_conflicts_existing_knowledge_id_fkey"
            columns: ["existing_knowledge_id"]
            isOneToOne: false
            referencedRelation: "ai_knowledge_base"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "data_conflicts_org_id_fkey"
            columns: ["org_id"]
            isOneToOne: false
            referencedRelation: "organizations"
            referencedColumns: ["id"]
          },
        ]
      }
      deduplicator_state: {
        Row: {
          avg_run_duration_ms: number | null
          created_at: string | null
          duplicates_found: number | null
          id: string
          items_checked: number | null
          last_processed_id: string | null
          last_run_at: string | null
          org_id: string
          total_merged_lifetime: number | null
          updated_at: string | null
        }
        Insert: {
          avg_run_duration_ms?: number | null
          created_at?: string | null
          duplicates_found?: number | null
          id?: string
          items_checked?: number | null
          last_processed_id?: string | null
          last_run_at?: string | null
          org_id: string
          total_merged_lifetime?: number | null
          updated_at?: string | null
        }
        Update: {
          avg_run_duration_ms?: number | null
          created_at?: string | null
          duplicates_found?: number | null
          id?: string
          items_checked?: number | null
          last_processed_id?: string | null
          last_run_at?: string | null
          org_id?: string
          total_merged_lifetime?: number | null
          updated_at?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "deduplicator_state_org_id_fkey"
            columns: ["org_id"]
            isOneToOne: true
            referencedRelation: "organizations"
            referencedColumns: ["id"]
          },
        ]
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
      document_audit_logs: {
        Row: {
          action: string
          application_id: string
          document_type: string
          file_path: string | null
          id: string
          metadata: Json | null
          performed_at: string
          performed_by: string | null
          user_agent: string | null
        }
        Insert: {
          action: string
          application_id: string
          document_type: string
          file_path?: string | null
          id?: string
          metadata?: Json | null
          performed_at?: string
          performed_by?: string | null
          user_agent?: string | null
        }
        Update: {
          action?: string
          application_id?: string
          document_type?: string
          file_path?: string | null
          id?: string
          metadata?: Json | null
          performed_at?: string
          performed_by?: string | null
          user_agent?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "document_audit_logs_application_id_fkey"
            columns: ["application_id"]
            isOneToOne: false
            referencedRelation: "professional_applications"
            referencedColumns: ["id"]
          },
        ]
      }
      embedding_failures: {
        Row: {
          attempted_at: string
          created_at: string | null
          error_message: string | null
          error_type: string
          id: string
          knowledge_id: string
          retry_count: number | null
          token_count: number | null
        }
        Insert: {
          attempted_at?: string
          created_at?: string | null
          error_message?: string | null
          error_type: string
          id?: string
          knowledge_id: string
          retry_count?: number | null
          token_count?: number | null
        }
        Update: {
          attempted_at?: string
          created_at?: string | null
          error_message?: string | null
          error_type?: string
          id?: string
          knowledge_id?: string
          retry_count?: number | null
          token_count?: number | null
        }
        Relationships: [
          {
            foreignKeyName: "embedding_failures_knowledge_id_fkey"
            columns: ["knowledge_id"]
            isOneToOne: false
            referencedRelation: "ai_knowledge_base"
            referencedColumns: ["id"]
          },
        ]
      }
      embedding_generation_log: {
        Row: {
          created_at: string | null
          error: string | null
          id: string
          knowledge_id: string | null
          request_id: number | null
          status: string | null
          trigger_time: string | null
        }
        Insert: {
          created_at?: string | null
          error?: string | null
          id?: string
          knowledge_id?: string | null
          request_id?: number | null
          status?: string | null
          trigger_time?: string | null
        }
        Update: {
          created_at?: string | null
          error?: string | null
          id?: string
          knowledge_id?: string | null
          request_id?: number | null
          status?: string | null
          trigger_time?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "embedding_generation_log_knowledge_id_fkey"
            columns: ["knowledge_id"]
            isOneToOne: false
            referencedRelation: "ai_knowledge_base"
            referencedColumns: ["id"]
          },
        ]
      }
      fast_path_patterns: {
        Row: {
          active_filter: boolean | null
          auto_reactivation_eligible: boolean | null
          avg_response_time_ms: number | null
          confidence_score: number | null
          consecutive_errors: number | null
          count_column: string | null
          created_at: string | null
          deactivated_at: string | null
          deactivation_reason: string | null
          deleted_at: string | null
          deleted_reason: string | null
          emoji: string | null
          error_count: number | null
          filters: Json | null
          harmful_count: number | null
          helpful_count: number | null
          id: string
          is_active: boolean | null
          keywords: string[]
          last_error: string | null
          last_error_at: string | null
          last_success_at: string | null
          last_used_at: string | null
          learned_from_query: string | null
          org_id: string
          pattern_type: string
          regex_pattern: string | null
          response_template: string
          source: string | null
          success_count: number | null
          table_name: string
          updated_at: string | null
          usage_count: number | null
        }
        Insert: {
          active_filter?: boolean | null
          auto_reactivation_eligible?: boolean | null
          avg_response_time_ms?: number | null
          confidence_score?: number | null
          consecutive_errors?: number | null
          count_column?: string | null
          created_at?: string | null
          deactivated_at?: string | null
          deactivation_reason?: string | null
          deleted_at?: string | null
          deleted_reason?: string | null
          emoji?: string | null
          error_count?: number | null
          filters?: Json | null
          harmful_count?: number | null
          helpful_count?: number | null
          id?: string
          is_active?: boolean | null
          keywords: string[]
          last_error?: string | null
          last_error_at?: string | null
          last_success_at?: string | null
          last_used_at?: string | null
          learned_from_query?: string | null
          org_id: string
          pattern_type?: string
          regex_pattern?: string | null
          response_template: string
          source?: string | null
          success_count?: number | null
          table_name: string
          updated_at?: string | null
          usage_count?: number | null
        }
        Update: {
          active_filter?: boolean | null
          auto_reactivation_eligible?: boolean | null
          avg_response_time_ms?: number | null
          confidence_score?: number | null
          consecutive_errors?: number | null
          count_column?: string | null
          created_at?: string | null
          deactivated_at?: string | null
          deactivation_reason?: string | null
          deleted_at?: string | null
          deleted_reason?: string | null
          emoji?: string | null
          error_count?: number | null
          filters?: Json | null
          harmful_count?: number | null
          helpful_count?: number | null
          id?: string
          is_active?: boolean | null
          keywords?: string[]
          last_error?: string | null
          last_error_at?: string | null
          last_success_at?: string | null
          last_used_at?: string | null
          learned_from_query?: string | null
          org_id?: string
          pattern_type?: string
          regex_pattern?: string | null
          response_template?: string
          source?: string | null
          success_count?: number | null
          table_name?: string
          updated_at?: string | null
          usage_count?: number | null
        }
        Relationships: [
          {
            foreignKeyName: "fast_path_patterns_org_id_fkey"
            columns: ["org_id"]
            isOneToOne: false
            referencedRelation: "organizations"
            referencedColumns: ["id"]
          },
        ]
      }
      fast_path_usage_log: {
        Row: {
          created_at: string | null
          error_message: string | null
          feedback_at: string | null
          feedback_type: string | null
          filters_applied: Json | null
          hardcoded_pattern_name: string | null
          id: string
          matched_hardcoded: boolean | null
          normalized_query: string | null
          org_id: string
          pattern_id: string | null
          query_hash: string | null
          response_time_ms: number | null
          result_count: number | null
          success: boolean | null
          table_name: string | null
          user_query: string
        }
        Insert: {
          created_at?: string | null
          error_message?: string | null
          feedback_at?: string | null
          feedback_type?: string | null
          filters_applied?: Json | null
          hardcoded_pattern_name?: string | null
          id?: string
          matched_hardcoded?: boolean | null
          normalized_query?: string | null
          org_id: string
          pattern_id?: string | null
          query_hash?: string | null
          response_time_ms?: number | null
          result_count?: number | null
          success?: boolean | null
          table_name?: string | null
          user_query: string
        }
        Update: {
          created_at?: string | null
          error_message?: string | null
          feedback_at?: string | null
          feedback_type?: string | null
          filters_applied?: Json | null
          hardcoded_pattern_name?: string | null
          id?: string
          matched_hardcoded?: boolean | null
          normalized_query?: string | null
          org_id?: string
          pattern_id?: string | null
          query_hash?: string | null
          response_time_ms?: number | null
          result_count?: number | null
          success?: boolean | null
          table_name?: string | null
          user_query?: string
        }
        Relationships: [
          {
            foreignKeyName: "fast_path_usage_log_org_id_fkey"
            columns: ["org_id"]
            isOneToOne: false
            referencedRelation: "organizations"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "fast_path_usage_log_pattern_id_fkey"
            columns: ["pattern_id"]
            isOneToOne: false
            referencedRelation: "fast_path_patterns"
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
          metadata: Json | null
          model_used: string | null
          org_id: string
          output_tokens: number | null
          preflight_incomplete_count: number | null
          semantic_match_score: number | null
          success: boolean | null
          total_tokens: number | null
          user_id: string | null
          validation_failed_count: number | null
        }
        Insert: {
          created_at?: string | null
          error_message?: string | null
          estimated_cost_eur?: number | null
          execution_time_ms?: number | null
          function_name: string
          id?: string
          input_tokens?: number | null
          metadata?: Json | null
          model_used?: string | null
          org_id: string
          output_tokens?: number | null
          preflight_incomplete_count?: number | null
          semantic_match_score?: number | null
          success?: boolean | null
          total_tokens?: number | null
          user_id?: string | null
          validation_failed_count?: number | null
        }
        Update: {
          created_at?: string | null
          error_message?: string | null
          estimated_cost_eur?: number | null
          execution_time_ms?: number | null
          function_name?: string
          id?: string
          input_tokens?: number | null
          metadata?: Json | null
          model_used?: string | null
          org_id?: string
          output_tokens?: number | null
          preflight_incomplete_count?: number | null
          semantic_match_score?: number | null
          success?: boolean | null
          total_tokens?: number | null
          user_id?: string | null
          validation_failed_count?: number | null
        }
        Relationships: []
      }
      hourly_rates: {
        Row: {
          basis_tarief: number
          btw_percentage: number
          created_at: string
          id: string
          is_active: boolean
          kostensoort: string
          sublocation_id: string
          uursoort_naam: string
        }
        Insert: {
          basis_tarief: number
          btw_percentage?: number
          created_at?: string
          id?: string
          is_active?: boolean
          kostensoort?: string
          sublocation_id: string
          uursoort_naam: string
        }
        Update: {
          basis_tarief?: number
          btw_percentage?: number
          created_at?: string
          id?: string
          is_active?: boolean
          kostensoort?: string
          sublocation_id?: string
          uursoort_naam?: string
        }
        Relationships: [
          {
            foreignKeyName: "hourly_rates_sublocation_id_fkey"
            columns: ["sublocation_id"]
            isOneToOne: false
            referencedRelation: "client_sublocations"
            referencedColumns: ["id"]
          },
        ]
      }
      intent_classification_audit: {
        Row: {
          application_id: string | null
          bypass_cooldown: boolean | null
          content_length: number | null
          created_at: string
          detected_intents: Json | null
          email_id: string | null
          frustration_indicators: Json | null
          id: string
          is_urgent: boolean | null
          org_id: string | null
          primary_confidence: number | null
          primary_intent: string | null
          processing_time_ms: number | null
          stripped_content: string | null
          urgency_score: number | null
        }
        Insert: {
          application_id?: string | null
          bypass_cooldown?: boolean | null
          content_length?: number | null
          created_at?: string
          detected_intents?: Json | null
          email_id?: string | null
          frustration_indicators?: Json | null
          id?: string
          is_urgent?: boolean | null
          org_id?: string | null
          primary_confidence?: number | null
          primary_intent?: string | null
          processing_time_ms?: number | null
          stripped_content?: string | null
          urgency_score?: number | null
        }
        Update: {
          application_id?: string | null
          bypass_cooldown?: boolean | null
          content_length?: number | null
          created_at?: string
          detected_intents?: Json | null
          email_id?: string | null
          frustration_indicators?: Json | null
          id?: string
          is_urgent?: boolean | null
          org_id?: string | null
          primary_confidence?: number | null
          primary_intent?: string | null
          processing_time_ms?: number | null
          stripped_content?: string | null
          urgency_score?: number | null
        }
        Relationships: [
          {
            foreignKeyName: "intent_classification_audit_application_id_fkey"
            columns: ["application_id"]
            isOneToOne: false
            referencedRelation: "professional_applications"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "intent_classification_audit_org_id_fkey"
            columns: ["org_id"]
            isOneToOne: false
            referencedRelation: "organizations"
            referencedColumns: ["id"]
          },
        ]
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
            foreignKeyName: "interview_appointments_professional_id_fkey"
            columns: ["professional_id"]
            isOneToOne: false
            referencedRelation: "professionals_admin_view"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "interview_appointments_professional_id_fkey"
            columns: ["professional_id"]
            isOneToOne: false
            referencedRelation: "professionals_public"
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
      kvk_validation_cache: {
        Row: {
          api_response: Json
          cached_at: string | null
          created_at: string | null
          expires_at: string | null
          hit_count: number | null
          id: string
          kvk_nummer: string
          last_accessed_at: string | null
          org_id: string | null
        }
        Insert: {
          api_response: Json
          cached_at?: string | null
          created_at?: string | null
          expires_at?: string | null
          hit_count?: number | null
          id?: string
          kvk_nummer: string
          last_accessed_at?: string | null
          org_id?: string | null
        }
        Update: {
          api_response?: Json
          cached_at?: string | null
          created_at?: string | null
          expires_at?: string | null
          hit_count?: number | null
          id?: string
          kvk_nummer?: string
          last_accessed_at?: string | null
          org_id?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "kvk_validation_cache_org_id_fkey"
            columns: ["org_id"]
            isOneToOne: false
            referencedRelation: "organizations"
            referencedColumns: ["id"]
          },
        ]
      }
      message_feedback: {
        Row: {
          created_at: string | null
          fast_path_log_id: string | null
          feedback_type: string
          id: string
          is_fast_path: boolean | null
          knowledge_ids: string[] | null
          message_id: string
          pattern_id: string | null
          processed_at: string | null
          processed_by: string | null
          user_id: string
        }
        Insert: {
          created_at?: string | null
          fast_path_log_id?: string | null
          feedback_type: string
          id?: string
          is_fast_path?: boolean | null
          knowledge_ids?: string[] | null
          message_id: string
          pattern_id?: string | null
          processed_at?: string | null
          processed_by?: string | null
          user_id: string
        }
        Update: {
          created_at?: string | null
          fast_path_log_id?: string | null
          feedback_type?: string
          id?: string
          is_fast_path?: boolean | null
          knowledge_ids?: string[] | null
          message_id?: string
          pattern_id?: string | null
          processed_at?: string | null
          processed_by?: string | null
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "message_feedback_fast_path_log_id_fkey"
            columns: ["fast_path_log_id"]
            isOneToOne: false
            referencedRelation: "fast_path_usage_log"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "message_feedback_pattern_id_fkey"
            columns: ["pattern_id"]
            isOneToOne: false
            referencedRelation: "fast_path_patterns"
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
      org_ai_budgets: {
        Row: {
          allow_temporary_overage: boolean
          budget_reset_day: number
          created_at: string
          created_by: string | null
          critical_sent_at: string | null
          critical_threshold_pct: number
          daily_budget_eur: number | null
          enforce_hard_limit: boolean
          id: string
          last_reset_at: string | null
          limit_reached_at: string | null
          monthly_budget_eur: number
          org_id: string
          updated_at: string
          warning_sent_at: string | null
          warning_threshold_pct: number
        }
        Insert: {
          allow_temporary_overage?: boolean
          budget_reset_day?: number
          created_at?: string
          created_by?: string | null
          critical_sent_at?: string | null
          critical_threshold_pct?: number
          daily_budget_eur?: number | null
          enforce_hard_limit?: boolean
          id?: string
          last_reset_at?: string | null
          limit_reached_at?: string | null
          monthly_budget_eur?: number
          org_id: string
          updated_at?: string
          warning_sent_at?: string | null
          warning_threshold_pct?: number
        }
        Update: {
          allow_temporary_overage?: boolean
          budget_reset_day?: number
          created_at?: string
          created_by?: string | null
          critical_sent_at?: string | null
          critical_threshold_pct?: number
          daily_budget_eur?: number | null
          enforce_hard_limit?: boolean
          id?: string
          last_reset_at?: string | null
          limit_reached_at?: string | null
          monthly_budget_eur?: number
          org_id?: string
          updated_at?: string
          warning_sent_at?: string | null
          warning_threshold_pct?: number
        }
        Relationships: [
          {
            foreignKeyName: "org_ai_budgets_org_id_fkey"
            columns: ["org_id"]
            isOneToOne: true
            referencedRelation: "organizations"
            referencedColumns: ["id"]
          },
        ]
      }
      org_profiles: {
        Row: {
          brand_name: string
          business_type: string
          confidence: number | null
          created_at: string | null
          created_by: string | null
          excluded_services: string[] | null
          id: string
          kvk_number: string | null
          org_id: string
          primary_domain: string | null
          secondary_domains: string[] | null
          services: Json | null
          updated_at: string | null
          verified: boolean | null
        }
        Insert: {
          brand_name: string
          business_type: string
          confidence?: number | null
          created_at?: string | null
          created_by?: string | null
          excluded_services?: string[] | null
          id?: string
          kvk_number?: string | null
          org_id: string
          primary_domain?: string | null
          secondary_domains?: string[] | null
          services?: Json | null
          updated_at?: string | null
          verified?: boolean | null
        }
        Update: {
          brand_name?: string
          business_type?: string
          confidence?: number | null
          created_at?: string | null
          created_by?: string | null
          excluded_services?: string[] | null
          id?: string
          kvk_number?: string | null
          org_id?: string
          primary_domain?: string | null
          secondary_domains?: string[] | null
          services?: Json | null
          updated_at?: string | null
          verified?: boolean | null
        }
        Relationships: [
          {
            foreignKeyName: "org_profiles_org_id_fkey"
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
      processed_emails: {
        Row: {
          application_id: string | null
          completed_at: string | null
          email_id: string | null
          error_message: string | null
          id: string
          message_id: string | null
          org_id: string | null
          processed_at: string
          processing_status: string
          result_summary: Json | null
        }
        Insert: {
          application_id?: string | null
          completed_at?: string | null
          email_id?: string | null
          error_message?: string | null
          id?: string
          message_id?: string | null
          org_id?: string | null
          processed_at?: string
          processing_status?: string
          result_summary?: Json | null
        }
        Update: {
          application_id?: string | null
          completed_at?: string | null
          email_id?: string | null
          error_message?: string | null
          id?: string
          message_id?: string | null
          org_id?: string | null
          processed_at?: string
          processing_status?: string
          result_summary?: Json | null
        }
        Relationships: [
          {
            foreignKeyName: "processed_emails_application_id_fkey"
            columns: ["application_id"]
            isOneToOne: false
            referencedRelation: "professional_applications"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "processed_emails_org_id_fkey"
            columns: ["org_id"]
            isOneToOne: false
            referencedRelation: "organizations"
            referencedColumns: ["id"]
          },
        ]
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
          ai_response_count: number | null
          bedrijfsnaam: string | null
          beroepsaansprakelijkheid_path: string | null
          bhv_certificaat_path: string | null
          completeness_score: number | null
          created_at: string | null
          cv_file_name: string | null
          cv_file_path: string | null
          deleted_at: string | null
          deleted_by: string | null
          diploma_file_path: string | null
          diploma_validation_source: string | null
          diploma_validation_status: string | null
          diploma_verification_response: Json | null
          documents_verified_at: string | null
          documents_verified_by: string | null
          duo_verification_result: Json | null
          duo_verification_status: string | null
          duo_verified_at: string | null
          email_body: string | null
          email_from: string
          email_subject: string | null
          extracted_data: Json | null
          iban: string | null
          id: string
          identiteitsbewijs_path: string | null
          interview_confirmed_slot: Json | null
          interview_scheduled_at: string | null
          interview_status: string | null
          is_test_data: boolean | null
          klachtenportaal_wkkgz_path: string | null
          kvk_uittreksel_path: string | null
          last_ai_response_at: string | null
          last_reverification_at: string | null
          missing_info: Json | null
          org_id: string | null
          overige_certificeringen_paths: Json | null
          pipeline_stage: string | null
          professional_id: string | null
          profile_photo_url: string | null
          rejected_at: string | null
          rejection_reason: string | null
          reverification_attempts: number | null
          source_label: string | null
          source_project: string | null
          status: string
          tillift_certificaat_path: string | null
          updated_at: string | null
          vog_issue_date: string | null
          vog_valid_until: string | null
          vog_validation_source: string | null
          vog_validation_status: string | null
          vog_verification_response: Json | null
          welcome_email_sent_at: string | null
        }
        Insert: {
          ai_response_count?: number | null
          bedrijfsnaam?: string | null
          beroepsaansprakelijkheid_path?: string | null
          bhv_certificaat_path?: string | null
          completeness_score?: number | null
          created_at?: string | null
          cv_file_name?: string | null
          cv_file_path?: string | null
          deleted_at?: string | null
          deleted_by?: string | null
          diploma_file_path?: string | null
          diploma_validation_source?: string | null
          diploma_validation_status?: string | null
          diploma_verification_response?: Json | null
          documents_verified_at?: string | null
          documents_verified_by?: string | null
          duo_verification_result?: Json | null
          duo_verification_status?: string | null
          duo_verified_at?: string | null
          email_body?: string | null
          email_from: string
          email_subject?: string | null
          extracted_data?: Json | null
          iban?: string | null
          id?: string
          identiteitsbewijs_path?: string | null
          interview_confirmed_slot?: Json | null
          interview_scheduled_at?: string | null
          interview_status?: string | null
          is_test_data?: boolean | null
          klachtenportaal_wkkgz_path?: string | null
          kvk_uittreksel_path?: string | null
          last_ai_response_at?: string | null
          last_reverification_at?: string | null
          missing_info?: Json | null
          org_id?: string | null
          overige_certificeringen_paths?: Json | null
          pipeline_stage?: string | null
          professional_id?: string | null
          profile_photo_url?: string | null
          rejected_at?: string | null
          rejection_reason?: string | null
          reverification_attempts?: number | null
          source_label?: string | null
          source_project?: string | null
          status?: string
          tillift_certificaat_path?: string | null
          updated_at?: string | null
          vog_issue_date?: string | null
          vog_valid_until?: string | null
          vog_validation_source?: string | null
          vog_validation_status?: string | null
          vog_verification_response?: Json | null
          welcome_email_sent_at?: string | null
        }
        Update: {
          ai_response_count?: number | null
          bedrijfsnaam?: string | null
          beroepsaansprakelijkheid_path?: string | null
          bhv_certificaat_path?: string | null
          completeness_score?: number | null
          created_at?: string | null
          cv_file_name?: string | null
          cv_file_path?: string | null
          deleted_at?: string | null
          deleted_by?: string | null
          diploma_file_path?: string | null
          diploma_validation_source?: string | null
          diploma_validation_status?: string | null
          diploma_verification_response?: Json | null
          documents_verified_at?: string | null
          documents_verified_by?: string | null
          duo_verification_result?: Json | null
          duo_verification_status?: string | null
          duo_verified_at?: string | null
          email_body?: string | null
          email_from?: string
          email_subject?: string | null
          extracted_data?: Json | null
          iban?: string | null
          id?: string
          identiteitsbewijs_path?: string | null
          interview_confirmed_slot?: Json | null
          interview_scheduled_at?: string | null
          interview_status?: string | null
          is_test_data?: boolean | null
          klachtenportaal_wkkgz_path?: string | null
          kvk_uittreksel_path?: string | null
          last_ai_response_at?: string | null
          last_reverification_at?: string | null
          missing_info?: Json | null
          org_id?: string | null
          overige_certificeringen_paths?: Json | null
          pipeline_stage?: string | null
          professional_id?: string | null
          profile_photo_url?: string | null
          rejected_at?: string | null
          rejection_reason?: string | null
          reverification_attempts?: number | null
          source_label?: string | null
          source_project?: string | null
          status?: string
          tillift_certificaat_path?: string | null
          updated_at?: string | null
          vog_issue_date?: string | null
          vog_valid_until?: string | null
          vog_validation_source?: string | null
          vog_validation_status?: string | null
          vog_verification_response?: Json | null
          welcome_email_sent_at?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "professional_applications_professional_id_fkey"
            columns: ["professional_id"]
            isOneToOne: false
            referencedRelation: "professionals"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "professional_applications_professional_id_fkey"
            columns: ["professional_id"]
            isOneToOne: false
            referencedRelation: "professionals_admin_view"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "professional_applications_professional_id_fkey"
            columns: ["professional_id"]
            isOneToOne: false
            referencedRelation: "professionals_public"
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
          {
            foreignKeyName: "professional_availability_professional_id_fkey"
            columns: ["professional_id"]
            isOneToOne: false
            referencedRelation: "professionals_admin_view"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "professional_availability_professional_id_fkey"
            columns: ["professional_id"]
            isOneToOne: false
            referencedRelation: "professionals_public"
            referencedColumns: ["id"]
          },
        ]
      }
      professional_client_matches: {
        Row: {
          client_id: string
          created_at: string | null
          created_by: string | null
          id: string
          match_reasoning: Json | null
          match_score: number | null
          org_id: string
          professional_id: string
          status: string | null
          updated_at: string | null
        }
        Insert: {
          client_id: string
          created_at?: string | null
          created_by?: string | null
          id?: string
          match_reasoning?: Json | null
          match_score?: number | null
          org_id: string
          professional_id: string
          status?: string | null
          updated_at?: string | null
        }
        Update: {
          client_id?: string
          created_at?: string | null
          created_by?: string | null
          id?: string
          match_reasoning?: Json | null
          match_score?: number | null
          org_id?: string
          professional_id?: string
          status?: string | null
          updated_at?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "professional_client_matches_org_id_fkey"
            columns: ["org_id"]
            isOneToOne: false
            referencedRelation: "organizations"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "professional_client_matches_professional_id_fkey"
            columns: ["professional_id"]
            isOneToOne: false
            referencedRelation: "professionals"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "professional_client_matches_professional_id_fkey"
            columns: ["professional_id"]
            isOneToOne: false
            referencedRelation: "professionals_admin_view"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "professional_client_matches_professional_id_fkey"
            columns: ["professional_id"]
            isOneToOne: false
            referencedRelation: "professionals_public"
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
            foreignKeyName: "professional_clients_professional_id_fkey"
            columns: ["professional_id"]
            isOneToOne: false
            referencedRelation: "professionals"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "professional_clients_professional_id_fkey"
            columns: ["professional_id"]
            isOneToOne: false
            referencedRelation: "professionals_admin_view"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "professional_clients_professional_id_fkey"
            columns: ["professional_id"]
            isOneToOne: false
            referencedRelation: "professionals_public"
            referencedColumns: ["id"]
          },
        ]
      }
      professional_interviews: {
        Row: {
          ai_assessment: Json | null
          application_id: string
          created_at: string | null
          id: string
          interviewer_id: string | null
          notes: string | null
          org_id: string
          outcome: string | null
          professional_id: string | null
          scheduled_at: string | null
          updated_at: string | null
        }
        Insert: {
          ai_assessment?: Json | null
          application_id: string
          created_at?: string | null
          id?: string
          interviewer_id?: string | null
          notes?: string | null
          org_id: string
          outcome?: string | null
          professional_id?: string | null
          scheduled_at?: string | null
          updated_at?: string | null
        }
        Update: {
          ai_assessment?: Json | null
          application_id?: string
          created_at?: string | null
          id?: string
          interviewer_id?: string | null
          notes?: string | null
          org_id?: string
          outcome?: string | null
          professional_id?: string | null
          scheduled_at?: string | null
          updated_at?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "professional_interviews_application_id_fkey"
            columns: ["application_id"]
            isOneToOne: false
            referencedRelation: "professional_applications"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "professional_interviews_org_id_fkey"
            columns: ["org_id"]
            isOneToOne: false
            referencedRelation: "organizations"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "professional_interviews_professional_id_fkey"
            columns: ["professional_id"]
            isOneToOne: false
            referencedRelation: "professionals"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "professional_interviews_professional_id_fkey"
            columns: ["professional_id"]
            isOneToOne: false
            referencedRelation: "professionals_admin_view"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "professional_interviews_professional_id_fkey"
            columns: ["professional_id"]
            isOneToOne: false
            referencedRelation: "professionals_public"
            referencedColumns: ["id"]
          },
        ]
      }
      professionals: {
        Row: {
          adres: string | null
          bedrijfsnaam: string | null
          beroepsaansprakelijkheid_path: string | null
          beschikbaarheid_uren: Json | null
          beschikbaarheidsnotities: string | null
          bhv_certificaat_path: string | null
          big_nummer: string | null
          btw_nummer: string | null
          cao_akkoord: boolean | null
          certificaten: string[] | null
          created_at: string
          cv_file_name: string | null
          cv_file_path: string | null
          cv_uploaded_at: string | null
          deleted_at: string | null
          diploma_document_path: string | null
          diploma_verification_details: Json | null
          diploma_verified: boolean | null
          diploma_verified_at: string | null
          doelgroep_ervaring: string[] | null
          email: string | null
          ervaring_sector: string[] | null
          full_name: string
          functie_niveau: string
          geboortedatum: string | null
          gewenst_uurloon: number | null
          heeft_auto: boolean | null
          heeft_rijbewijs: boolean | null
          iban: string | null
          id: string
          identiteitsbewijs_path: string | null
          is_test_data: boolean | null
          jaren_ervaring: number | null
          klachtenportaal_wkkgz_path: string | null
          kvk_nummer: string | null
          kvk_uittreksel_path: string | null
          leidinggevende_ervaring: boolean | null
          max_reisafstand_km: number | null
          nachtdienst_bereid: boolean | null
          opleidingen: Json | null
          org_id: string
          overige_certificeringen_paths: Json | null
          postcode: string | null
          profile_photo_url: string | null
          provincie: string | null
          rating: number | null
          regio: string | null
          regio_voorkeur: string[] | null
          skills: string[] | null
          specialisaties: string[] | null
          specifieke_doelgroepen: string[] | null
          status: string
          tags: string[] | null
          talen: string[] | null
          telefoonnummer: string | null
          tillift_certificaat_path: string | null
          updated_at: string
          vog_date: string | null
          weekenddienst_bereid: boolean | null
          werkvorm: string | null
          woonplaats: string | null
        }
        Insert: {
          adres?: string | null
          bedrijfsnaam?: string | null
          beroepsaansprakelijkheid_path?: string | null
          beschikbaarheid_uren?: Json | null
          beschikbaarheidsnotities?: string | null
          bhv_certificaat_path?: string | null
          big_nummer?: string | null
          btw_nummer?: string | null
          cao_akkoord?: boolean | null
          certificaten?: string[] | null
          created_at?: string
          cv_file_name?: string | null
          cv_file_path?: string | null
          cv_uploaded_at?: string | null
          deleted_at?: string | null
          diploma_document_path?: string | null
          diploma_verification_details?: Json | null
          diploma_verified?: boolean | null
          diploma_verified_at?: string | null
          doelgroep_ervaring?: string[] | null
          email?: string | null
          ervaring_sector?: string[] | null
          full_name: string
          functie_niveau: string
          geboortedatum?: string | null
          gewenst_uurloon?: number | null
          heeft_auto?: boolean | null
          heeft_rijbewijs?: boolean | null
          iban?: string | null
          id?: string
          identiteitsbewijs_path?: string | null
          is_test_data?: boolean | null
          jaren_ervaring?: number | null
          klachtenportaal_wkkgz_path?: string | null
          kvk_nummer?: string | null
          kvk_uittreksel_path?: string | null
          leidinggevende_ervaring?: boolean | null
          max_reisafstand_km?: number | null
          nachtdienst_bereid?: boolean | null
          opleidingen?: Json | null
          org_id: string
          overige_certificeringen_paths?: Json | null
          postcode?: string | null
          profile_photo_url?: string | null
          provincie?: string | null
          rating?: number | null
          regio?: string | null
          regio_voorkeur?: string[] | null
          skills?: string[] | null
          specialisaties?: string[] | null
          specifieke_doelgroepen?: string[] | null
          status?: string
          tags?: string[] | null
          talen?: string[] | null
          telefoonnummer?: string | null
          tillift_certificaat_path?: string | null
          updated_at?: string
          vog_date?: string | null
          weekenddienst_bereid?: boolean | null
          werkvorm?: string | null
          woonplaats?: string | null
        }
        Update: {
          adres?: string | null
          bedrijfsnaam?: string | null
          beroepsaansprakelijkheid_path?: string | null
          beschikbaarheid_uren?: Json | null
          beschikbaarheidsnotities?: string | null
          bhv_certificaat_path?: string | null
          big_nummer?: string | null
          btw_nummer?: string | null
          cao_akkoord?: boolean | null
          certificaten?: string[] | null
          created_at?: string
          cv_file_name?: string | null
          cv_file_path?: string | null
          cv_uploaded_at?: string | null
          deleted_at?: string | null
          diploma_document_path?: string | null
          diploma_verification_details?: Json | null
          diploma_verified?: boolean | null
          diploma_verified_at?: string | null
          doelgroep_ervaring?: string[] | null
          email?: string | null
          ervaring_sector?: string[] | null
          full_name?: string
          functie_niveau?: string
          geboortedatum?: string | null
          gewenst_uurloon?: number | null
          heeft_auto?: boolean | null
          heeft_rijbewijs?: boolean | null
          iban?: string | null
          id?: string
          identiteitsbewijs_path?: string | null
          is_test_data?: boolean | null
          jaren_ervaring?: number | null
          klachtenportaal_wkkgz_path?: string | null
          kvk_nummer?: string | null
          kvk_uittreksel_path?: string | null
          leidinggevende_ervaring?: boolean | null
          max_reisafstand_km?: number | null
          nachtdienst_bereid?: boolean | null
          opleidingen?: Json | null
          org_id?: string
          overige_certificeringen_paths?: Json | null
          postcode?: string | null
          profile_photo_url?: string | null
          provincie?: string | null
          rating?: number | null
          regio?: string | null
          regio_voorkeur?: string[] | null
          skills?: string[] | null
          specialisaties?: string[] | null
          specifieke_doelgroepen?: string[] | null
          status?: string
          tags?: string[] | null
          talen?: string[] | null
          telefoonnummer?: string | null
          tillift_certificaat_path?: string | null
          updated_at?: string
          vog_date?: string | null
          weekenddienst_bereid?: boolean | null
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
          last_validation_date: string | null
          name: string | null
          validation_streak: number | null
        }
        Insert: {
          created_at?: string
          email?: string | null
          id: string
          image?: string | null
          last_validation_date?: string | null
          name?: string | null
          validation_streak?: number | null
        }
        Update: {
          created_at?: string
          email?: string | null
          id?: string
          image?: string | null
          last_validation_date?: string | null
          name?: string | null
          validation_streak?: number | null
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
      recruiter_notifications: {
        Row: {
          application_id: string | null
          created_at: string
          dismissed_at: string | null
          email_sent_at: string | null
          id: string
          message: string
          metadata: Json | null
          notification_type: string
          org_id: string | null
          professional_id: string | null
          read_at: string | null
          title: string
          user_id: string | null
        }
        Insert: {
          application_id?: string | null
          created_at?: string
          dismissed_at?: string | null
          email_sent_at?: string | null
          id?: string
          message: string
          metadata?: Json | null
          notification_type: string
          org_id?: string | null
          professional_id?: string | null
          read_at?: string | null
          title: string
          user_id?: string | null
        }
        Update: {
          application_id?: string | null
          created_at?: string
          dismissed_at?: string | null
          email_sent_at?: string | null
          id?: string
          message?: string
          metadata?: Json | null
          notification_type?: string
          org_id?: string | null
          professional_id?: string | null
          read_at?: string | null
          title?: string
          user_id?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "recruiter_notifications_application_id_fkey"
            columns: ["application_id"]
            isOneToOne: false
            referencedRelation: "professional_applications"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "recruiter_notifications_org_id_fkey"
            columns: ["org_id"]
            isOneToOne: false
            referencedRelation: "organizations"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "recruiter_notifications_professional_id_fkey"
            columns: ["professional_id"]
            isOneToOne: false
            referencedRelation: "professionals"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "recruiter_notifications_professional_id_fkey"
            columns: ["professional_id"]
            isOneToOne: false
            referencedRelation: "professionals_admin_view"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "recruiter_notifications_professional_id_fkey"
            columns: ["professional_id"]
            isOneToOne: false
            referencedRelation: "professionals_public"
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
      response_validations: {
        Row: {
          accuracy_score: number | null
          ai_response: string
          completeness_score: number | null
          contradictions_found: string[] | null
          coverage_score: number | null
          created_at: string | null
          id: string
          knowledge_ids: string[] | null
          missing_aspects: string[] | null
          org_id: string
          question: string
          retry_attempted: boolean | null
          unsourced_facts: string[] | null
          user_id: string | null
          validation_passed: boolean
          validation_time_ms: number | null
        }
        Insert: {
          accuracy_score?: number | null
          ai_response: string
          completeness_score?: number | null
          contradictions_found?: string[] | null
          coverage_score?: number | null
          created_at?: string | null
          id?: string
          knowledge_ids?: string[] | null
          missing_aspects?: string[] | null
          org_id: string
          question: string
          retry_attempted?: boolean | null
          unsourced_facts?: string[] | null
          user_id?: string | null
          validation_passed: boolean
          validation_time_ms?: number | null
        }
        Update: {
          accuracy_score?: number | null
          ai_response?: string
          completeness_score?: number | null
          contradictions_found?: string[] | null
          coverage_score?: number | null
          created_at?: string | null
          id?: string
          knowledge_ids?: string[] | null
          missing_aspects?: string[] | null
          org_id?: string
          question?: string
          retry_attempted?: boolean | null
          unsourced_facts?: string[] | null
          user_id?: string | null
          validation_passed?: boolean
          validation_time_ms?: number | null
        }
        Relationships: [
          {
            foreignKeyName: "response_validations_org_id_fkey"
            columns: ["org_id"]
            isOneToOne: false
            referencedRelation: "organizations"
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
          created_by: string | null
          expires_at: string | null
          id: string
          last_accessed_at: string | null
          project_id: string | null
          task_id: string | null
          token: string
          view_count: number | null
        }
        Insert: {
          can_comment?: boolean
          created_at?: string
          created_by?: string | null
          expires_at?: string | null
          id?: string
          last_accessed_at?: string | null
          project_id?: string | null
          task_id?: string | null
          token: string
          view_count?: number | null
        }
        Update: {
          can_comment?: boolean
          created_at?: string
          created_by?: string | null
          expires_at?: string | null
          id?: string
          last_accessed_at?: string | null
          project_id?: string | null
          task_id?: string | null
          token?: string
          view_count?: number | null
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
      slot_detection_audit: {
        Row: {
          ai_confidence: number | null
          ai_result: number | null
          application_id: string | null
          correct_slot: number | null
          created_at: string
          detection_method: string | null
          email_id: string | null
          feedback_at: string | null
          final_result: number | null
          id: string
          message_id: string | null
          offered_slots: Json | null
          org_id: string | null
          processing_time_ms: number | null
          raw_email_text: string | null
          regex_result: number | null
          stripped_reply: string | null
          user_confirmed: boolean | null
        }
        Insert: {
          ai_confidence?: number | null
          ai_result?: number | null
          application_id?: string | null
          correct_slot?: number | null
          created_at?: string
          detection_method?: string | null
          email_id?: string | null
          feedback_at?: string | null
          final_result?: number | null
          id?: string
          message_id?: string | null
          offered_slots?: Json | null
          org_id?: string | null
          processing_time_ms?: number | null
          raw_email_text?: string | null
          regex_result?: number | null
          stripped_reply?: string | null
          user_confirmed?: boolean | null
        }
        Update: {
          ai_confidence?: number | null
          ai_result?: number | null
          application_id?: string | null
          correct_slot?: number | null
          created_at?: string
          detection_method?: string | null
          email_id?: string | null
          feedback_at?: string | null
          final_result?: number | null
          id?: string
          message_id?: string | null
          offered_slots?: Json | null
          org_id?: string | null
          processing_time_ms?: number | null
          raw_email_text?: string | null
          regex_result?: number | null
          stripped_reply?: string | null
          user_confirmed?: boolean | null
        }
        Relationships: [
          {
            foreignKeyName: "slot_detection_audit_application_id_fkey"
            columns: ["application_id"]
            isOneToOne: false
            referencedRelation: "professional_applications"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "slot_detection_audit_org_id_fkey"
            columns: ["org_id"]
            isOneToOne: false
            referencedRelation: "organizations"
            referencedColumns: ["id"]
          },
        ]
      }
      specialisme_expert_knowledge: {
        Row: {
          created_at: string
          expert_naam: string
          id: string
          keywords: string[] | null
          match_criteria: Json
          methodieken: string[] | null
          specialisme: string
          uitleg_template: string | null
          updated_at: string
          vereiste_certificaten: string[] | null
          vereiste_ervaring: string[] | null
        }
        Insert: {
          created_at?: string
          expert_naam: string
          id?: string
          keywords?: string[] | null
          match_criteria?: Json
          methodieken?: string[] | null
          specialisme: string
          uitleg_template?: string | null
          updated_at?: string
          vereiste_certificaten?: string[] | null
          vereiste_ervaring?: string[] | null
        }
        Update: {
          created_at?: string
          expert_naam?: string
          id?: string
          keywords?: string[] | null
          match_criteria?: Json
          methodieken?: string[] | null
          specialisme?: string
          uitleg_template?: string | null
          updated_at?: string
          vereiste_certificaten?: string[] | null
          vereiste_ervaring?: string[] | null
        }
        Relationships: []
      }
      spending_alerts: {
        Row: {
          acknowledged_at: string | null
          acknowledged_by: string | null
          action_taken: string | null
          alert_type: string
          budget_limit_eur: number
          created_at: string
          current_spend_eur: number
          id: string
          metadata: Json | null
          org_id: string
          percentage_used: number
          period_type: string
          resolved_at: string | null
        }
        Insert: {
          acknowledged_at?: string | null
          acknowledged_by?: string | null
          action_taken?: string | null
          alert_type: string
          budget_limit_eur: number
          created_at?: string
          current_spend_eur: number
          id?: string
          metadata?: Json | null
          org_id: string
          percentage_used: number
          period_type: string
          resolved_at?: string | null
        }
        Update: {
          acknowledged_at?: string | null
          acknowledged_by?: string | null
          action_taken?: string | null
          alert_type?: string
          budget_limit_eur?: number
          created_at?: string
          current_spend_eur?: number
          id?: string
          metadata?: Json | null
          org_id?: string
          percentage_used?: number
          period_type?: string
          resolved_at?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "spending_alerts_org_id_fkey"
            columns: ["org_id"]
            isOneToOne: false
            referencedRelation: "organizations"
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
      system_config: {
        Row: {
          automation_paused: boolean
          created_at: string | null
          daily_ai_budget_eur: number | null
          id: string
          org_id: string
          updated_at: string | null
        }
        Insert: {
          automation_paused?: boolean
          created_at?: string | null
          daily_ai_budget_eur?: number | null
          id?: string
          org_id: string
          updated_at?: string | null
        }
        Update: {
          automation_paused?: boolean
          created_at?: string | null
          daily_ai_budget_eur?: number | null
          id?: string
          org_id?: string
          updated_at?: string | null
        }
        Relationships: []
      }
      system_events: {
        Row: {
          created_at: string
          entity_id: string
          entity_type: string
          event_data: Json
          event_type: string
          id: string
          is_test_data: boolean | null
          learning_outcome: Json | null
          metadata: Json | null
          org_id: string | null
          processed_at: string | null
          user_id: string | null
        }
        Insert: {
          created_at?: string
          entity_id: string
          entity_type: string
          event_data: Json
          event_type: string
          id?: string
          is_test_data?: boolean | null
          learning_outcome?: Json | null
          metadata?: Json | null
          org_id?: string | null
          processed_at?: string | null
          user_id?: string | null
        }
        Update: {
          created_at?: string
          entity_id?: string
          entity_type?: string
          event_data?: Json
          event_type?: string
          id?: string
          is_test_data?: boolean | null
          learning_outcome?: Json | null
          metadata?: Json | null
          org_id?: string | null
          processed_at?: string | null
          user_id?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "system_events_org_id_fkey"
            columns: ["org_id"]
            isOneToOne: false
            referencedRelation: "organizations"
            referencedColumns: ["id"]
          },
        ]
      }
      system_health_log: {
        Row: {
          actions_taken: Json | null
          check_type: string
          created_at: string | null
          details: Json | null
          id: string
          org_id: string
          status: string
        }
        Insert: {
          actions_taken?: Json | null
          check_type: string
          created_at?: string | null
          details?: Json | null
          id?: string
          org_id: string
          status: string
        }
        Update: {
          actions_taken?: Json | null
          check_type?: string
          created_at?: string | null
          details?: Json | null
          id?: string
          org_id?: string
          status?: string
        }
        Relationships: [
          {
            foreignKeyName: "system_health_log_org_id_fkey"
            columns: ["org_id"]
            isOneToOne: false
            referencedRelation: "organizations"
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
          application_id: string | null
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
          interview_details: Json | null
          is_all_day: boolean
          is_forecast: boolean | null
          next_action: string | null
          order_key: string
          org_id: string
          priority: Database["public"]["Enums"]["priority"]
          project_id: string | null
          recruitment_action_type: string | null
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
          application_id?: string | null
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
          interview_details?: Json | null
          is_all_day?: boolean
          is_forecast?: boolean | null
          next_action?: string | null
          order_key?: string
          org_id: string
          priority?: Database["public"]["Enums"]["priority"]
          project_id?: string | null
          recruitment_action_type?: string | null
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
          application_id?: string | null
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
          interview_details?: Json | null
          is_all_day?: boolean
          is_forecast?: boolean | null
          next_action?: string | null
          order_key?: string
          org_id?: string
          priority?: Database["public"]["Enums"]["priority"]
          project_id?: string | null
          recruitment_action_type?: string | null
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
            foreignKeyName: "tasks_application_id_fkey"
            columns: ["application_id"]
            isOneToOne: false
            referencedRelation: "professional_applications"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "tasks_assignee_id_fkey"
            columns: ["assignee_id"]
            isOneToOne: false
            referencedRelation: "profiles"
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
      vacancies: {
        Row: {
          aantal_fte: number | null
          beschrijving: string | null
          created_at: string
          created_by: string | null
          deadline: string | null
          eind_datum: string | null
          functie_niveau: string
          gewenste_doelgroep_ervaring: string[] | null
          gewenste_sector_ervaring: string[] | null
          id: string
          start_datum: string | null
          status: string
          sublocation_id: string
          titel: string
          updated_at: string
          uren_per_week: number | null
          urgentie: string
          uurtarief_indicatie: number | null
          vereiste_certificaten: string[] | null
        }
        Insert: {
          aantal_fte?: number | null
          beschrijving?: string | null
          created_at?: string
          created_by?: string | null
          deadline?: string | null
          eind_datum?: string | null
          functie_niveau: string
          gewenste_doelgroep_ervaring?: string[] | null
          gewenste_sector_ervaring?: string[] | null
          id?: string
          start_datum?: string | null
          status?: string
          sublocation_id: string
          titel: string
          updated_at?: string
          uren_per_week?: number | null
          urgentie?: string
          uurtarief_indicatie?: number | null
          vereiste_certificaten?: string[] | null
        }
        Update: {
          aantal_fte?: number | null
          beschrijving?: string | null
          created_at?: string
          created_by?: string | null
          deadline?: string | null
          eind_datum?: string | null
          functie_niveau?: string
          gewenste_doelgroep_ervaring?: string[] | null
          gewenste_sector_ervaring?: string[] | null
          id?: string
          start_datum?: string | null
          status?: string
          sublocation_id?: string
          titel?: string
          updated_at?: string
          uren_per_week?: number | null
          urgentie?: string
          uurtarief_indicatie?: number | null
          vereiste_certificaten?: string[] | null
        }
        Relationships: [
          {
            foreignKeyName: "vacancies_sublocation_id_fkey"
            columns: ["sublocation_id"]
            isOneToOne: false
            referencedRelation: "client_sublocations"
            referencedColumns: ["id"]
          },
        ]
      }
      vacancy_applications: {
        Row: {
          application_id: string | null
          applied_at: string
          id: string
          match_reasoning: Json | null
          match_score: number | null
          notes: string | null
          professional_id: string | null
          status: string
          updated_at: string
          vacancy_id: string
        }
        Insert: {
          application_id?: string | null
          applied_at?: string
          id?: string
          match_reasoning?: Json | null
          match_score?: number | null
          notes?: string | null
          professional_id?: string | null
          status?: string
          updated_at?: string
          vacancy_id: string
        }
        Update: {
          application_id?: string | null
          applied_at?: string
          id?: string
          match_reasoning?: Json | null
          match_score?: number | null
          notes?: string | null
          professional_id?: string | null
          status?: string
          updated_at?: string
          vacancy_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "vacancy_applications_application_id_fkey"
            columns: ["application_id"]
            isOneToOne: false
            referencedRelation: "professional_applications"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "vacancy_applications_professional_id_fkey"
            columns: ["professional_id"]
            isOneToOne: false
            referencedRelation: "professionals"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "vacancy_applications_professional_id_fkey"
            columns: ["professional_id"]
            isOneToOne: false
            referencedRelation: "professionals_admin_view"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "vacancy_applications_professional_id_fkey"
            columns: ["professional_id"]
            isOneToOne: false
            referencedRelation: "professionals_public"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "vacancy_applications_vacancy_id_fkey"
            columns: ["vacancy_id"]
            isOneToOne: false
            referencedRelation: "vacancies"
            referencedColumns: ["id"]
          },
        ]
      }
      vog_screening_requirements: {
        Row: {
          created_at: string
          doelgroep: string[] | null
          functie_niveau: string
          id: string
          profile_description: string
          required_functieaspecten: string[] | null
          required_profile_code: string
        }
        Insert: {
          created_at?: string
          doelgroep?: string[] | null
          functie_niveau: string
          id?: string
          profile_description: string
          required_functieaspecten?: string[] | null
          required_profile_code: string
        }
        Update: {
          created_at?: string
          doelgroep?: string[] | null
          functie_niveau?: string
          id?: string
          profile_description?: string
          required_functieaspecten?: string[] | null
          required_profile_code?: string
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
      werkvorm_tarieven: {
        Row: {
          basis_tarief: number
          btw_percentage: number | null
          created_at: string | null
          functie_niveau: string
          id: string
          is_active: boolean | null
          sublocation_id: string
          toeslag_percentage: number | null
          updated_at: string | null
          werkvorm: string
        }
        Insert: {
          basis_tarief: number
          btw_percentage?: number | null
          created_at?: string | null
          functie_niveau: string
          id?: string
          is_active?: boolean | null
          sublocation_id: string
          toeslag_percentage?: number | null
          updated_at?: string | null
          werkvorm: string
        }
        Update: {
          basis_tarief?: number
          btw_percentage?: number | null
          created_at?: string | null
          functie_niveau?: string
          id?: string
          is_active?: boolean | null
          sublocation_id?: string
          toeslag_percentage?: number | null
          updated_at?: string | null
          werkvorm?: string
        }
        Relationships: [
          {
            foreignKeyName: "werkvorm_tarieven_sublocation_id_fkey"
            columns: ["sublocation_id"]
            isOneToOne: false
            referencedRelation: "client_sublocations"
            referencedColumns: ["id"]
          },
        ]
      }
      wtt_rules: {
        Row: {
          created_at: string
          dagtype: string
          flex_tarief: number | null
          hourly_rate_id: string
          id: string
          marge_bedrag: number | null
          marge_percentage: number | null
          tarief_klant: number | null
          tijd_tot: string
          tijd_van: string
          wtt_percentage: number
        }
        Insert: {
          created_at?: string
          dagtype: string
          flex_tarief?: number | null
          hourly_rate_id: string
          id?: string
          marge_bedrag?: number | null
          marge_percentage?: number | null
          tarief_klant?: number | null
          tijd_tot: string
          tijd_van: string
          wtt_percentage: number
        }
        Update: {
          created_at?: string
          dagtype?: string
          flex_tarief?: number | null
          hourly_rate_id?: string
          id?: string
          marge_bedrag?: number | null
          marge_percentage?: number | null
          tarief_klant?: number | null
          tijd_tot?: string
          tijd_van?: string
          wtt_percentage?: number
        }
        Relationships: [
          {
            foreignKeyName: "wtt_rules_hourly_rate_id_fkey"
            columns: ["hourly_rate_id"]
            isOneToOne: false
            referencedRelation: "hourly_rates"
            referencedColumns: ["id"]
          },
        ]
      }
    }
    Views: {
      assignment_details: {
        Row: {
          ai_match_reasoning: Json | null
          ai_match_score: number | null
          basis_tarief: number | null
          bemiddelingsbureau: string | null
          btw_percentage: number | null
          created_at: string | null
          doelgroep: string[] | null
          end_date: string | null
          functie_niveau: string | null
          hourly_rate_id: string | null
          id: string | null
          location_name: string | null
          location_plaats: string | null
          notes: string | null
          organization_name: string | null
          professional_id: string | null
          professional_name: string | null
          sector: string[] | null
          start_date: string | null
          status: string | null
          sublocation_id: string | null
          sublocation_name: string | null
          sublocation_plaats: string | null
          updated_at: string | null
          uursoort_naam: string | null
          weekly_hours: number | null
          werkvorm: string | null
        }
        Relationships: [
          {
            foreignKeyName: "assignments_hourly_rate_id_fkey"
            columns: ["hourly_rate_id"]
            isOneToOne: false
            referencedRelation: "hourly_rates"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "assignments_professional_id_fkey"
            columns: ["professional_id"]
            isOneToOne: false
            referencedRelation: "professionals"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "assignments_professional_id_fkey"
            columns: ["professional_id"]
            isOneToOne: false
            referencedRelation: "professionals_admin_view"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "assignments_professional_id_fkey"
            columns: ["professional_id"]
            isOneToOne: false
            referencedRelation: "professionals_public"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "assignments_sublocation_id_fkey"
            columns: ["sublocation_id"]
            isOneToOne: false
            referencedRelation: "client_sublocations"
            referencedColumns: ["id"]
          },
        ]
      }
      autonomous_system_status: {
        Row: {
          component: string | null
          items_generated: number | null
          items_last_24h: number | null
          last_run: string | null
        }
        Relationships: []
      }
      chat_messages: {
        Row: {
          confidence_score: number | null
          content: string | null
          conversation_id: string | null
          created_at: string | null
          id: string | null
          message_id: string | null
          metadata: Json | null
          org_id: string | null
          role: string | null
          used_knowledge: Json | null
          user_id: string | null
        }
        Insert: {
          confidence_score?: number | null
          content?: string | null
          conversation_id?: string | null
          created_at?: string | null
          id?: string | null
          message_id?: string | null
          metadata?: never
          org_id?: string | null
          role?: string | null
          used_knowledge?: Json | null
          user_id?: string | null
        }
        Update: {
          confidence_score?: number | null
          content?: string | null
          conversation_id?: string | null
          created_at?: string | null
          id?: string | null
          message_id?: string | null
          metadata?: never
          org_id?: string | null
          role?: string | null
          used_knowledge?: Json | null
          user_id?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "ai_chat_messages_org_id_fkey"
            columns: ["org_id"]
            isOneToOne: false
            referencedRelation: "organizations"
            referencedColumns: ["id"]
          },
        ]
      }
      embedding_coverage_summary: {
        Row: {
          coverage_percentage: number | null
          items_missing_embeddings: number | null
          items_with_embeddings: number | null
          org_id: string | null
          org_name: string | null
          total_kb_items: number | null
        }
        Relationships: [
          {
            foreignKeyName: "ai_knowledge_base_org_id_fkey"
            columns: ["org_id"]
            isOneToOne: false
            referencedRelation: "organizations"
            referencedColumns: ["id"]
          },
        ]
      }
      org_spending_summary: {
        Row: {
          avg_cost_per_call: number | null
          last_call_at: string | null
          month_calls: number | null
          month_spend_eur: number | null
          org_id: string | null
          refreshed_at: string | null
          today_calls: number | null
          today_spend_eur: number | null
          week_spend_eur: number | null
        }
        Relationships: []
      }
      professionals_admin_view: {
        Row: {
          adres: string | null
          beschikbaarheidsnotities: string | null
          big_nummer: string | null
          btw_nummer: string | null
          cao_akkoord: boolean | null
          created_at: string | null
          deleted_at: string | null
          email: string | null
          full_name: string | null
          functie_niveau: string | null
          gewenst_uurloon: number | null
          heeft_auto: boolean | null
          heeft_rijbewijs: boolean | null
          id: string | null
          is_test_data: boolean | null
          kvk_nummer: string | null
          org_id: string | null
          postcode: string | null
          provincie: string | null
          rating: number | null
          regio: string | null
          skills: string[] | null
          status: string | null
          tags: string[] | null
          telefoonnummer: string | null
          updated_at: string | null
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
          created_at?: string | null
          deleted_at?: string | null
          email?: string | null
          full_name?: string | null
          functie_niveau?: string | null
          gewenst_uurloon?: number | null
          heeft_auto?: boolean | null
          heeft_rijbewijs?: boolean | null
          id?: string | null
          is_test_data?: boolean | null
          kvk_nummer?: string | null
          org_id?: string | null
          postcode?: string | null
          provincie?: string | null
          rating?: number | null
          regio?: string | null
          skills?: string[] | null
          status?: string | null
          tags?: string[] | null
          telefoonnummer?: string | null
          updated_at?: string | null
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
          created_at?: string | null
          deleted_at?: string | null
          email?: string | null
          full_name?: string | null
          functie_niveau?: string | null
          gewenst_uurloon?: number | null
          heeft_auto?: boolean | null
          heeft_rijbewijs?: boolean | null
          id?: string | null
          is_test_data?: boolean | null
          kvk_nummer?: string | null
          org_id?: string | null
          postcode?: string | null
          provincie?: string | null
          rating?: number | null
          regio?: string | null
          skills?: string[] | null
          status?: string | null
          tags?: string[] | null
          telefoonnummer?: string | null
          updated_at?: string | null
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
      professionals_public: {
        Row: {
          beschikbaarheidsnotities: string | null
          created_at: string | null
          full_name: string | null
          functie_niveau: string | null
          heeft_auto: boolean | null
          heeft_rijbewijs: boolean | null
          id: string | null
          org_id: string | null
          provincie: string | null
          rating: number | null
          regio: string | null
          skills: string[] | null
          status: string | null
          tags: string[] | null
          werkvorm: string | null
        }
        Insert: {
          beschikbaarheidsnotities?: string | null
          created_at?: string | null
          full_name?: string | null
          functie_niveau?: string | null
          heeft_auto?: boolean | null
          heeft_rijbewijs?: boolean | null
          id?: string | null
          org_id?: string | null
          provincie?: string | null
          rating?: number | null
          regio?: string | null
          skills?: string[] | null
          status?: string | null
          tags?: string[] | null
          werkvorm?: string | null
        }
        Update: {
          beschikbaarheidsnotities?: string | null
          created_at?: string | null
          full_name?: string | null
          functie_niveau?: string | null
          heeft_auto?: boolean | null
          heeft_rijbewijs?: boolean | null
          id?: string | null
          org_id?: string | null
          provincie?: string | null
          rating?: number | null
          regio?: string | null
          skills?: string[] | null
          status?: string | null
          tags?: string[] | null
          werkvorm?: string | null
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
    }
    Functions: {
      atomic_increment_feedback: {
        Args: {
          p_feedback_type: string
          p_knowledge_id: string
          p_org_id: string
        }
        Returns: Json
      }
      atomic_reinforce_knowledge: {
        Args: {
          p_knowledge_id: string
          p_org_id: string
          p_stability_boost?: number
          p_usage_increment?: number
        }
        Returns: Json
      }
      atomic_update_confidence: {
        Args: {
          p_auto_prune?: boolean
          p_delta: number
          p_knowledge_id: string
          p_max_confidence?: number
          p_min_confidence?: number
          p_org_id: string
        }
        Returns: Json
      }
      check_budget_status: {
        Args: { _org_id: string; _requested_cost_eur?: number }
        Returns: Json
      }
      check_duplicate_email: {
        Args: { p_email: string; p_table?: string }
        Returns: {
          email: string
          id: string
          naam: string
        }[]
      }
      check_emrex_reminders: { Args: never; Returns: undefined }
      cleanup_old_logs: { Args: never; Returns: undefined }
      create_interview_task:
        | {
            Args: {
              p_application_id: string
              p_candidate_name: string
              p_interview_date: string
              p_notes?: string
            }
            Returns: string
          }
        | {
            Args: {
              p_application_id: string
              p_candidate_email?: string
              p_candidate_name: string
              p_duration_minutes?: number
              p_interview_date: string
              p_interview_type?: string
              p_interviewer_email?: string
              p_interviewer_name?: string
              p_location?: string
              p_notes?: string
              p_org_id?: string
              p_organization_name?: string
              p_teams_link?: string
            }
            Returns: string
          }
      get_ai_health_summary: { Args: never; Returns: Json }
      get_knowledge_without_embeddings: {
        Args: { batch_limit?: number }
        Returns: {
          category: string
          confidence_score: number
          id: string
          original_text: string
          source_type: string
          usage_count: number
          value: Json
        }[]
      }
      get_relevant_categories: {
        Args: { org_id_param?: string; user_question: string }
        Returns: {
          category_name: string
          confidence: number
        }[]
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
      increment_pattern_counter: {
        Args: { counter_name: string; delta?: number; pattern_id: string }
        Returns: undefined
      }
      increment_usage_count: {
        Args: { knowledge_id: string }
        Returns: undefined
      }
      is_knowledge_valid: {
        Args: { _valid_from: string; _valid_to: string }
        Returns: boolean
      }
      match_knowledge:
        | {
            Args: {
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
              similarity: number
              value: Json
            }[]
          }
        | {
            Args: {
              filter_customer_id?: string
              filter_jurisdiction?: string
              filter_org_id?: string
              filter_role_tags?: string[]
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
        | {
            Args: {
              filter_customer_id?: string
              filter_jurisdiction?: string
              filter_org_id?: string
              filter_role_tags?: string[]
              include_shared?: boolean
              match_count?: number
              match_threshold?: number
              query_embedding: string
              require_verified?: boolean
            }
            Returns: {
              category: string
              confidence_score: number
              is_shared: boolean
              key: string
              knowledge_id: string
              role_tags: string[]
              similarity: number
              valid_from: string
              valid_to: string
              validation_status: string
              value: Json
            }[]
          }
      redact_pii: { Args: { input_text: string }; Returns: string }
      transition_application_stage:
        | {
            Args: {
              p_application_id: string
              p_metadata?: Json
              p_reason?: string
              p_to_stage: string
            }
            Returns: Json
          }
        | {
            Args: {
              p_application_id: string
              p_to_stage: string
              p_user_id?: string
            }
            Returns: Json
          }
      update_pattern_metrics: {
        Args: {
          p_pattern_id: string
          p_reset_errors?: boolean
          p_response_time_ms: number
          p_was_successful: boolean
        }
        Returns: undefined
      }
      user_is_org_member: {
        Args: { _org_id: string; _user_id: string }
        Returns: boolean
      }
      verify_document_manual: {
        Args: {
          p_application_id: string
          p_document_type: string
          p_notes?: string
          p_verified: boolean
        }
        Returns: Json
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
