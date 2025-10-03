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
      ai_knowledge_base: {
        Row: {
          category: string
          confidence_score: number | null
          created_at: string | null
          id: string
          key: string
          last_used_at: string | null
          org_id: string
          source: string | null
          updated_at: string | null
          usage_count: number | null
          user_id: string
          value: Json
        }
        Insert: {
          category: string
          confidence_score?: number | null
          created_at?: string | null
          id?: string
          key: string
          last_used_at?: string | null
          org_id: string
          source?: string | null
          updated_at?: string | null
          usage_count?: number | null
          user_id: string
          value: Json
        }
        Update: {
          category?: string
          confidence_score?: number | null
          created_at?: string | null
          id?: string
          key?: string
          last_used_at?: string | null
          org_id?: string
          source?: string | null
          updated_at?: string | null
          usage_count?: number | null
          user_id?: string
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
        ]
      }
      ai_learning_events: {
        Row: {
          ai_response: Json | null
          applied_to_knowledge_base: boolean | null
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
          status: string | null
          title: string
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
          status?: string | null
          title: string
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
          status?: string | null
          title?: string
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
      chat_messages: {
        Row: {
          content: string
          conversation_id: string | null
          created_at: string | null
          id: string
          role: string
          user_id: string
        }
        Insert: {
          content: string
          conversation_id?: string | null
          created_at?: string | null
          id?: string
          role: string
          user_id: string
        }
        Update: {
          content?: string
          conversation_id?: string | null
          created_at?: string | null
          id?: string
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
          client_id: string | null
          column_id: string | null
          completed_at: string | null
          created_at: string
          deleted_at: string | null
          deleted_by: string | null
          description: string | null
          due_at: string | null
          estimate_min: number | null
          id: string
          is_all_day: boolean
          next_action: string | null
          order_key: string
          org_id: string
          priority: Database["public"]["Enums"]["priority"]
          project_id: string | null
          reporter_id: string | null
          revenue_impact_eur: number | null
          sequence_number: number | null
          start_at: string | null
          title: string
          transition_related: boolean | null
          updated_at: string
        }
        Insert: {
          accepted_at?: string | null
          accepted_by?: string | null
          assignee_id?: string | null
          client_id?: string | null
          column_id?: string | null
          completed_at?: string | null
          created_at?: string
          deleted_at?: string | null
          deleted_by?: string | null
          description?: string | null
          due_at?: string | null
          estimate_min?: number | null
          id?: string
          is_all_day?: boolean
          next_action?: string | null
          order_key?: string
          org_id: string
          priority?: Database["public"]["Enums"]["priority"]
          project_id?: string | null
          reporter_id?: string | null
          revenue_impact_eur?: number | null
          sequence_number?: number | null
          start_at?: string | null
          title: string
          transition_related?: boolean | null
          updated_at?: string
        }
        Update: {
          accepted_at?: string | null
          accepted_by?: string | null
          assignee_id?: string | null
          client_id?: string | null
          column_id?: string | null
          completed_at?: string | null
          created_at?: string
          deleted_at?: string | null
          deleted_by?: string | null
          description?: string | null
          due_at?: string | null
          estimate_min?: number | null
          id?: string
          is_all_day?: boolean
          next_action?: string | null
          order_key?: string
          org_id?: string
          priority?: Database["public"]["Enums"]["priority"]
          project_id?: string | null
          reporter_id?: string | null
          revenue_impact_eur?: number | null
          sequence_number?: number | null
          start_at?: string | null
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
          extracted_knowledge_count: number | null
          file_name: string
          file_path: string
          file_size: number
          id: string
          mime_type: string
          org_id: string
          original_folder: string | null
          processed_at: string | null
          processing_progress: number | null
          relative_path: string | null
          status: string
          user_id: string
        }
        Insert: {
          created_at?: string | null
          extracted_knowledge_count?: number | null
          file_name: string
          file_path: string
          file_size: number
          id?: string
          mime_type: string
          org_id: string
          original_folder?: string | null
          processed_at?: string | null
          processing_progress?: number | null
          relative_path?: string | null
          status?: string
          user_id: string
        }
        Update: {
          created_at?: string | null
          extracted_knowledge_count?: number | null
          file_name?: string
          file_path?: string
          file_size?: number
          id?: string
          mime_type?: string
          org_id?: string
          original_folder?: string | null
          processed_at?: string | null
          processing_progress?: number | null
          relative_path?: string | null
          status?: string
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
      [_ in never]: never
    }
    Functions: {
      user_is_org_member: {
        Args: { _org_id: string; _user_id: string }
        Returns: boolean
      }
    }
    Enums: {
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
      dependency_type: ["BLOCKS", "RELATES", "DUPLICATE"],
      priority: ["LOW", "MEDIUM", "HIGH", "CRITICAL"],
      reminder_channel: ["IN_APP", "EMAIL"],
      subtask_status: ["pending", "active", "completed", "skipped"],
      task_status: ["BACKLOG", "READY", "DOING", "BLOCKED", "REVIEW", "DONE"],
      user_role: ["OWNER", "ADMIN", "MEMBER", "GUEST"],
    },
  },
} as const
