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
    PostgrestVersion: "14.5"
  }
  public: {
    Tables: {
      assistant_messages: {
        Row: {
          content: Json
          created_at: string
          id: string
          role: string
          user_id: string
        }
        Insert: {
          content: Json
          created_at?: string
          id?: string
          role: string
          user_id: string
        }
        Update: {
          content?: Json
          created_at?: string
          id?: string
          role?: string
          user_id?: string
        }
        Relationships: []
      }
      attendance_logs: {
        Row: {
          approved_at: string | null
          approved_by: string | null
          created_at: string
          daily_note: string | null
          date: string
          id: string
          last_edited_by: string | null
          next_actions: string | null
          punch_in_time: string | null
          punch_out_time: string | null
          tasks: Json
          total_hours: number | null
          updated_at: string
          user_id: string
        }
        Insert: {
          approved_at?: string | null
          approved_by?: string | null
          created_at?: string
          daily_note?: string | null
          date: string
          id?: string
          last_edited_by?: string | null
          next_actions?: string | null
          punch_in_time?: string | null
          punch_out_time?: string | null
          tasks?: Json
          total_hours?: number | null
          updated_at?: string
          user_id: string
        }
        Update: {
          approved_at?: string | null
          approved_by?: string | null
          created_at?: string
          daily_note?: string | null
          date?: string
          id?: string
          last_edited_by?: string | null
          next_actions?: string | null
          punch_in_time?: string | null
          punch_out_time?: string | null
          tasks?: Json
          total_hours?: number | null
          updated_at?: string
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "attendance_logs_user_id_fkey"
            columns: ["user_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
        ]
      }
      department_heads: {
        Row: {
          created_at: string
          department: string
          updated_at: string
          user_id: string
        }
        Insert: {
          created_at?: string
          department: string
          updated_at?: string
          user_id: string
        }
        Update: {
          created_at?: string
          department?: string
          updated_at?: string
          user_id?: string
        }
        Relationships: []
      }
      department_settings: {
        Row: {
          color: string
          created_at: string
          name: string
          updated_at: string
        }
        Insert: {
          color: string
          created_at?: string
          name: string
          updated_at?: string
        }
        Update: {
          color?: string
          created_at?: string
          name?: string
          updated_at?: string
        }
        Relationships: []
      }
      employee_bank_details: {
        Row: {
          account_holder_name: string
          account_number: string
          bank_branch: string
          created_at: string
          ifsc_code: string
          pan_number: string
          updated_at: string
          user_id: string
        }
        Insert: {
          account_holder_name: string
          account_number: string
          bank_branch: string
          created_at?: string
          ifsc_code: string
          pan_number: string
          updated_at?: string
          user_id: string
        }
        Update: {
          account_holder_name?: string
          account_number?: string
          bank_branch?: string
          created_at?: string
          ifsc_code?: string
          pan_number?: string
          updated_at?: string
          user_id?: string
        }
        Relationships: []
      }
      employee_documents: {
        Row: {
          doc_type: Database["public"]["Enums"]["employee_doc_type"]
          id: string
          storage_path: string
          uploaded_at: string
          user_id: string
        }
        Insert: {
          doc_type: Database["public"]["Enums"]["employee_doc_type"]
          id?: string
          storage_path: string
          uploaded_at?: string
          user_id: string
        }
        Update: {
          doc_type?: Database["public"]["Enums"]["employee_doc_type"]
          id?: string
          storage_path?: string
          uploaded_at?: string
          user_id?: string
        }
        Relationships: []
      }
      google_calendar_events: {
        Row: {
          all_day: boolean
          attendees_count: number
          calendar_id: string
          description_snippet: string | null
          end_at: string
          google_event_id: string
          html_link: string | null
          id: string
          is_private: boolean
          location: string | null
          meeting_link: string | null
          organizer_email: string | null
          start_at: string
          status: string | null
          summary: string
          synced_at: string
          updated_at: string
          user_id: string
        }
        Insert: {
          all_day?: boolean
          attendees_count?: number
          calendar_id?: string
          description_snippet?: string | null
          end_at: string
          google_event_id: string
          html_link?: string | null
          id?: string
          is_private?: boolean
          location?: string | null
          meeting_link?: string | null
          organizer_email?: string | null
          start_at: string
          status?: string | null
          summary: string
          synced_at?: string
          updated_at?: string
          user_id: string
        }
        Update: {
          all_day?: boolean
          attendees_count?: number
          calendar_id?: string
          description_snippet?: string | null
          end_at?: string
          google_event_id?: string
          html_link?: string | null
          id?: string
          is_private?: boolean
          location?: string | null
          meeting_link?: string | null
          organizer_email?: string | null
          start_at?: string
          status?: string | null
          summary?: string
          synced_at?: string
          updated_at?: string
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "google_calendar_events_user_id_fkey"
            columns: ["user_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
        ]
      }
      google_calendar_tokens: {
        Row: {
          access_token: string
          connected_at: string
          expires_at: string
          google_email: string | null
          last_synced_at: string | null
          refresh_token: string | null
          scope: string | null
          sync_error: string | null
          updated_at: string
          user_id: string
        }
        Insert: {
          access_token: string
          connected_at?: string
          expires_at: string
          google_email?: string | null
          last_synced_at?: string | null
          refresh_token?: string | null
          scope?: string | null
          sync_error?: string | null
          updated_at?: string
          user_id: string
        }
        Update: {
          access_token?: string
          connected_at?: string
          expires_at?: string
          google_email?: string | null
          last_synced_at?: string | null
          refresh_token?: string | null
          scope?: string | null
          sync_error?: string | null
          updated_at?: string
          user_id?: string
        }
        Relationships: []
      }
      holidays: {
        Row: {
          created_at: string
          holiday_date: string
          id: string
          name: string
        }
        Insert: {
          created_at?: string
          holiday_date: string
          id?: string
          name: string
        }
        Update: {
          created_at?: string
          holiday_date?: string
          id?: string
          name?: string
        }
        Relationships: []
      }
      leave_balances: {
        Row: {
          allocated: number
          id: string
          leave_type: Database["public"]["Enums"]["leave_type"]
          updated_at: string
          used: number
          user_id: string
        }
        Insert: {
          allocated?: number
          id?: string
          leave_type: Database["public"]["Enums"]["leave_type"]
          updated_at?: string
          used?: number
          user_id: string
        }
        Update: {
          allocated?: number
          id?: string
          leave_type?: Database["public"]["Enums"]["leave_type"]
          updated_at?: string
          used?: number
          user_id?: string
        }
        Relationships: []
      }
      leave_requests: {
        Row: {
          admin_comment: string | null
          created_at: string
          days: number
          decided_at: string | null
          decided_by: string | null
          end_date: string
          id: string
          leave_type: Database["public"]["Enums"]["leave_type"]
          reason: string | null
          start_date: string
          status: Database["public"]["Enums"]["leave_status"]
          updated_at: string
          user_id: string
        }
        Insert: {
          admin_comment?: string | null
          created_at?: string
          days: number
          decided_at?: string | null
          decided_by?: string | null
          end_date: string
          id?: string
          leave_type: Database["public"]["Enums"]["leave_type"]
          reason?: string | null
          start_date: string
          status?: Database["public"]["Enums"]["leave_status"]
          updated_at?: string
          user_id: string
        }
        Update: {
          admin_comment?: string | null
          created_at?: string
          days?: number
          decided_at?: string | null
          decided_by?: string | null
          end_date?: string
          id?: string
          leave_type?: Database["public"]["Enums"]["leave_type"]
          reason?: string | null
          start_date?: string
          status?: Database["public"]["Enums"]["leave_status"]
          updated_at?: string
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "leave_requests_user_profile_fkey"
            columns: ["user_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
        ]
      }
      profiles: {
        Row: {
          avatar_url: string | null
          created_at: string
          date_of_birth: string | null
          day_start_time: string | null
          deactivated_at: string | null
          deactivated_by: string | null
          department: string | null
          email: string | null
          employment_type: string | null
          facebook_url: string | null
          full_name: string | null
          github_url: string | null
          id: string
          instagram_url: string | null
          is_active: boolean
          is_placeholder: boolean
          joined_on: string | null
          linkedin_url: string | null
          marriage_anniversary: string | null
          must_change_password: boolean
          notes: string | null
          onboarding_completed: boolean
          onboarding_completed_at: string | null
          permanent_address: string | null
          personal_email: string | null
          phone: string | null
          pinterest_url: string | null
          profile_picture_url: string | null
          reporting_manager_id: string | null
          reviews_confirmed_at: string | null
          social_follows_confirmed_at: string | null
          standup_time: string | null
          twitter_url: string | null
          updated_at: string
          youtube_url: string | null
        }
        Insert: {
          avatar_url?: string | null
          created_at?: string
          date_of_birth?: string | null
          day_start_time?: string | null
          deactivated_at?: string | null
          deactivated_by?: string | null
          department?: string | null
          email?: string | null
          employment_type?: string | null
          facebook_url?: string | null
          full_name?: string | null
          github_url?: string | null
          id: string
          instagram_url?: string | null
          is_active?: boolean
          is_placeholder?: boolean
          joined_on?: string | null
          linkedin_url?: string | null
          marriage_anniversary?: string | null
          must_change_password?: boolean
          notes?: string | null
          onboarding_completed?: boolean
          onboarding_completed_at?: string | null
          permanent_address?: string | null
          personal_email?: string | null
          phone?: string | null
          pinterest_url?: string | null
          profile_picture_url?: string | null
          reporting_manager_id?: string | null
          reviews_confirmed_at?: string | null
          social_follows_confirmed_at?: string | null
          standup_time?: string | null
          twitter_url?: string | null
          updated_at?: string
          youtube_url?: string | null
        }
        Update: {
          avatar_url?: string | null
          created_at?: string
          date_of_birth?: string | null
          day_start_time?: string | null
          deactivated_at?: string | null
          deactivated_by?: string | null
          department?: string | null
          email?: string | null
          employment_type?: string | null
          facebook_url?: string | null
          full_name?: string | null
          github_url?: string | null
          id?: string
          instagram_url?: string | null
          is_active?: boolean
          is_placeholder?: boolean
          joined_on?: string | null
          linkedin_url?: string | null
          marriage_anniversary?: string | null
          must_change_password?: boolean
          notes?: string | null
          onboarding_completed?: boolean
          onboarding_completed_at?: string | null
          permanent_address?: string | null
          personal_email?: string | null
          phone?: string | null
          pinterest_url?: string | null
          profile_picture_url?: string | null
          reporting_manager_id?: string | null
          reviews_confirmed_at?: string | null
          social_follows_confirmed_at?: string | null
          standup_time?: string | null
          twitter_url?: string | null
          updated_at?: string
          youtube_url?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "profiles_reporting_manager_id_fkey"
            columns: ["reporting_manager_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
        ]
      }
      projects: {
        Row: {
          client_name: string | null
          code: string
          created_at: string
          created_by: string | null
          description: string | null
          end_date: string | null
          id: string
          name: string
          start_date: string | null
          status: Database["public"]["Enums"]["project_status"]
          updated_at: string
        }
        Insert: {
          client_name?: string | null
          code: string
          created_at?: string
          created_by?: string | null
          description?: string | null
          end_date?: string | null
          id?: string
          name: string
          start_date?: string | null
          status?: Database["public"]["Enums"]["project_status"]
          updated_at?: string
        }
        Update: {
          client_name?: string | null
          code?: string
          created_at?: string
          created_by?: string | null
          description?: string | null
          end_date?: string | null
          id?: string
          name?: string
          start_date?: string | null
          status?: Database["public"]["Enums"]["project_status"]
          updated_at?: string
        }
        Relationships: []
      }
      punch_sessions: {
        Row: {
          allocations: Json
          comments: string | null
          created_at: string
          hours: number | null
          id: string
          project_code: string | null
          project_id: string | null
          project_name: string | null
          punch_in_time: string
          punch_out_time: string | null
          session_date: string
          updated_at: string
          user_id: string
        }
        Insert: {
          allocations?: Json
          comments?: string | null
          created_at?: string
          hours?: number | null
          id?: string
          project_code?: string | null
          project_id?: string | null
          project_name?: string | null
          punch_in_time?: string
          punch_out_time?: string | null
          session_date: string
          updated_at?: string
          user_id: string
        }
        Update: {
          allocations?: Json
          comments?: string | null
          created_at?: string
          hours?: number | null
          id?: string
          project_code?: string | null
          project_id?: string | null
          project_name?: string | null
          punch_in_time?: string
          punch_out_time?: string | null
          session_date?: string
          updated_at?: string
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "punch_sessions_project_id_fkey"
            columns: ["project_id"]
            isOneToOne: false
            referencedRelation: "projects"
            referencedColumns: ["id"]
          },
        ]
      }
      role_grants: {
        Row: {
          created_at: string
          default_monthly_salary: number | null
          department: string | null
          email: string
          is_super_admin: boolean
          role: Database["public"]["Enums"]["app_role"]
        }
        Insert: {
          created_at?: string
          default_monthly_salary?: number | null
          department?: string | null
          email: string
          is_super_admin?: boolean
          role?: Database["public"]["Enums"]["app_role"]
        }
        Update: {
          created_at?: string
          default_monthly_salary?: number | null
          department?: string | null
          email?: string
          is_super_admin?: boolean
          role?: Database["public"]["Enums"]["app_role"]
        }
        Relationships: []
      }
      role_task_type_presets: {
        Row: {
          created_at: string
          id: string
          role_key: string
          sort: number
          task_type_id: string
        }
        Insert: {
          created_at?: string
          id?: string
          role_key: string
          sort?: number
          task_type_id: string
        }
        Update: {
          created_at?: string
          id?: string
          role_key?: string
          sort?: number
          task_type_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "role_task_type_presets_task_type_id_fkey"
            columns: ["task_type_id"]
            isOneToOne: false
            referencedRelation: "taxonomy_task_types"
            referencedColumns: ["id"]
          },
        ]
      }
      salaries: {
        Row: {
          created_at: string
          currency: string
          effective_from: string
          id: string
          monthly_salary: number
          notes: string | null
          updated_at: string
          user_id: string
        }
        Insert: {
          created_at?: string
          currency?: string
          effective_from?: string
          id?: string
          monthly_salary: number
          notes?: string | null
          updated_at?: string
          user_id: string
        }
        Update: {
          created_at?: string
          currency?: string
          effective_from?: string
          id?: string
          monthly_salary?: number
          notes?: string | null
          updated_at?: string
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "salaries_user_id_fkey"
            columns: ["user_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
        ]
      }
      super_admins: {
        Row: {
          created_at: string
          user_id: string
        }
        Insert: {
          created_at?: string
          user_id: string
        }
        Update: {
          created_at?: string
          user_id?: string
        }
        Relationships: []
      }
      task_task_types: {
        Row: {
          task_id: string
          task_type_id: string
        }
        Insert: {
          task_id: string
          task_type_id: string
        }
        Update: {
          task_id?: string
          task_type_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "task_task_types_task_id_fkey"
            columns: ["task_id"]
            isOneToOne: false
            referencedRelation: "tasks"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "task_task_types_task_type_id_fkey"
            columns: ["task_type_id"]
            isOneToOne: false
            referencedRelation: "taxonomy_task_types"
            referencedColumns: ["id"]
          },
        ]
      }
      task_template_task_types: {
        Row: {
          task_type_id: string
          template_id: string
        }
        Insert: {
          task_type_id: string
          template_id: string
        }
        Update: {
          task_type_id?: string
          template_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "task_template_task_types_task_type_id_fkey"
            columns: ["task_type_id"]
            isOneToOne: false
            referencedRelation: "taxonomy_task_types"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "task_template_task_types_template_id_fkey"
            columns: ["template_id"]
            isOneToOne: false
            referencedRelation: "task_templates"
            referencedColumns: ["id"]
          },
        ]
      }
      task_templates: {
        Row: {
          active: boolean
          asset_links: Json
          created_at: string
          created_by: string | null
          day_of_month: number | null
          default_assignee_id: string | null
          department_id: string | null
          description: string | null
          domain_id: string | null
          id: string
          priority: Database["public"]["Enums"]["task_priority"]
          project_id: string | null
          recurrence: Database["public"]["Enums"]["task_recurrence"]
          title: string
          updated_at: string
          weekday: number | null
        }
        Insert: {
          active?: boolean
          asset_links?: Json
          created_at?: string
          created_by?: string | null
          day_of_month?: number | null
          default_assignee_id?: string | null
          department_id?: string | null
          description?: string | null
          domain_id?: string | null
          id?: string
          priority?: Database["public"]["Enums"]["task_priority"]
          project_id?: string | null
          recurrence?: Database["public"]["Enums"]["task_recurrence"]
          title: string
          updated_at?: string
          weekday?: number | null
        }
        Update: {
          active?: boolean
          asset_links?: Json
          created_at?: string
          created_by?: string | null
          day_of_month?: number | null
          default_assignee_id?: string | null
          department_id?: string | null
          description?: string | null
          domain_id?: string | null
          id?: string
          priority?: Database["public"]["Enums"]["task_priority"]
          project_id?: string | null
          recurrence?: Database["public"]["Enums"]["task_recurrence"]
          title?: string
          updated_at?: string
          weekday?: number | null
        }
        Relationships: [
          {
            foreignKeyName: "task_templates_department_id_fkey"
            columns: ["department_id"]
            isOneToOne: false
            referencedRelation: "taxonomy_departments"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "task_templates_domain_id_fkey"
            columns: ["domain_id"]
            isOneToOne: false
            referencedRelation: "taxonomy_domains"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "task_templates_project_id_fkey"
            columns: ["project_id"]
            isOneToOne: false
            referencedRelation: "projects"
            referencedColumns: ["id"]
          },
        ]
      }
      tasks: {
        Row: {
          asset_links: Json
          assignee_id: string | null
          created_at: string
          created_by: string | null
          department_id: string | null
          description: string | null
          domain_id: string | null
          due_date: string | null
          id: string
          priority: Database["public"]["Enums"]["task_priority"]
          project_id: string
          status: Database["public"]["Enums"]["task_status"]
          template_id: string | null
          title: string
          updated_at: string
        }
        Insert: {
          asset_links?: Json
          assignee_id?: string | null
          created_at?: string
          created_by?: string | null
          department_id?: string | null
          description?: string | null
          domain_id?: string | null
          due_date?: string | null
          id?: string
          priority?: Database["public"]["Enums"]["task_priority"]
          project_id: string
          status?: Database["public"]["Enums"]["task_status"]
          template_id?: string | null
          title: string
          updated_at?: string
        }
        Update: {
          asset_links?: Json
          assignee_id?: string | null
          created_at?: string
          created_by?: string | null
          department_id?: string | null
          description?: string | null
          domain_id?: string | null
          due_date?: string | null
          id?: string
          priority?: Database["public"]["Enums"]["task_priority"]
          project_id?: string
          status?: Database["public"]["Enums"]["task_status"]
          template_id?: string | null
          title?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "tasks_assignee_profile_fkey"
            columns: ["assignee_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "tasks_department_id_fkey"
            columns: ["department_id"]
            isOneToOne: false
            referencedRelation: "taxonomy_departments"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "tasks_domain_id_fkey"
            columns: ["domain_id"]
            isOneToOne: false
            referencedRelation: "taxonomy_domains"
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
            foreignKeyName: "tasks_template_id_fkey"
            columns: ["template_id"]
            isOneToOne: false
            referencedRelation: "task_templates"
            referencedColumns: ["id"]
          },
        ]
      }
      taxonomy_departments: {
        Row: {
          active: boolean
          created_at: string
          domain_id: string
          id: string
          name: string
          sort: number
          updated_at: string
        }
        Insert: {
          active?: boolean
          created_at?: string
          domain_id: string
          id?: string
          name: string
          sort?: number
          updated_at?: string
        }
        Update: {
          active?: boolean
          created_at?: string
          domain_id?: string
          id?: string
          name?: string
          sort?: number
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "taxonomy_departments_domain_id_fkey"
            columns: ["domain_id"]
            isOneToOne: false
            referencedRelation: "taxonomy_domains"
            referencedColumns: ["id"]
          },
        ]
      }
      taxonomy_domains: {
        Row: {
          active: boolean
          created_at: string
          id: string
          name: string
          sort: number
          updated_at: string
        }
        Insert: {
          active?: boolean
          created_at?: string
          id?: string
          name: string
          sort?: number
          updated_at?: string
        }
        Update: {
          active?: boolean
          created_at?: string
          id?: string
          name?: string
          sort?: number
          updated_at?: string
        }
        Relationships: []
      }
      taxonomy_task_types: {
        Row: {
          active: boolean
          created_at: string
          created_by: string | null
          department_id: string | null
          id: string
          is_custom: boolean
          name: string
          updated_at: string
        }
        Insert: {
          active?: boolean
          created_at?: string
          created_by?: string | null
          department_id?: string | null
          id?: string
          is_custom?: boolean
          name: string
          updated_at?: string
        }
        Update: {
          active?: boolean
          created_at?: string
          created_by?: string | null
          department_id?: string | null
          id?: string
          is_custom?: boolean
          name?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "taxonomy_task_types_department_id_fkey"
            columns: ["department_id"]
            isOneToOne: false
            referencedRelation: "taxonomy_departments"
            referencedColumns: ["id"]
          },
        ]
      }
      team_calendar_bookings: {
        Row: {
          attendee_emails: Json
          calendar_id: string
          created_at: string
          created_by: string
          description: string | null
          end_at: string
          error: string | null
          google_event_id: string | null
          id: string
          location: string | null
          meeting_link: string | null
          start_at: string
          status: string
          title: string
          updated_at: string
        }
        Insert: {
          attendee_emails?: Json
          calendar_id?: string
          created_at?: string
          created_by: string
          description?: string | null
          end_at: string
          error?: string | null
          google_event_id?: string | null
          id?: string
          location?: string | null
          meeting_link?: string | null
          start_at: string
          status?: string
          title: string
          updated_at?: string
        }
        Update: {
          attendee_emails?: Json
          calendar_id?: string
          created_at?: string
          created_by?: string
          description?: string | null
          end_at?: string
          error?: string | null
          google_event_id?: string | null
          id?: string
          location?: string | null
          meeting_link?: string | null
          start_at?: string
          status?: string
          title?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "team_calendar_bookings_created_by_fkey"
            columns: ["created_by"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
        ]
      }
      user_roles: {
        Row: {
          created_at: string
          id: string
          role: Database["public"]["Enums"]["app_role"]
          user_id: string
        }
        Insert: {
          created_at?: string
          id?: string
          role: Database["public"]["Enums"]["app_role"]
          user_id: string
        }
        Update: {
          created_at?: string
          id?: string
          role?: Database["public"]["Enums"]["app_role"]
          user_id?: string
        }
        Relationships: []
      }
      user_task_presets: {
        Row: {
          department_id: string | null
          domain_id: string | null
          id: string
          label: string | null
          task_type_id: string | null
          updated_at: string
          use_count: number
          user_id: string
        }
        Insert: {
          department_id?: string | null
          domain_id?: string | null
          id?: string
          label?: string | null
          task_type_id?: string | null
          updated_at?: string
          use_count?: number
          user_id: string
        }
        Update: {
          department_id?: string | null
          domain_id?: string | null
          id?: string
          label?: string | null
          task_type_id?: string | null
          updated_at?: string
          use_count?: number
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "user_task_presets_department_id_fkey"
            columns: ["department_id"]
            isOneToOne: false
            referencedRelation: "taxonomy_departments"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "user_task_presets_domain_id_fkey"
            columns: ["domain_id"]
            isOneToOne: false
            referencedRelation: "taxonomy_domains"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "user_task_presets_task_type_id_fkey"
            columns: ["task_type_id"]
            isOneToOne: false
            referencedRelation: "taxonomy_task_types"
            referencedColumns: ["id"]
          },
        ]
      }
      vendor_payments: {
        Row: {
          amount: number
          created_at: string
          created_by: string | null
          currency: string
          description: string | null
          id: string
          payment_date: string
          project_id: string | null
          status: string
          updated_at: string
          vendor_id: string
        }
        Insert: {
          amount: number
          created_at?: string
          created_by?: string | null
          currency?: string
          description?: string | null
          id?: string
          payment_date?: string
          project_id?: string | null
          status?: string
          updated_at?: string
          vendor_id: string
        }
        Update: {
          amount?: number
          created_at?: string
          created_by?: string | null
          currency?: string
          description?: string | null
          id?: string
          payment_date?: string
          project_id?: string | null
          status?: string
          updated_at?: string
          vendor_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "vendor_payments_project_id_fkey"
            columns: ["project_id"]
            isOneToOne: false
            referencedRelation: "projects"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "vendor_payments_vendor_id_fkey"
            columns: ["vendor_id"]
            isOneToOne: false
            referencedRelation: "vendors"
            referencedColumns: ["id"]
          },
        ]
      }
      vendors: {
        Row: {
          created_at: string
          email: string | null
          id: string
          name: string
          notes: string | null
          phone: string | null
          updated_at: string
        }
        Insert: {
          created_at?: string
          email?: string | null
          id?: string
          name: string
          notes?: string | null
          phone?: string | null
          updated_at?: string
        }
        Update: {
          created_at?: string
          email?: string | null
          id?: string
          name?: string
          notes?: string | null
          phone?: string | null
          updated_at?: string
        }
        Relationships: []
      }
    }
    Views: {
      team_leave_calendar: {
        Row: {
          end_date: string | null
          full_name: string | null
          id: string | null
          leave_type: Database["public"]["Enums"]["leave_type"] | null
          start_date: string | null
          status: Database["public"]["Enums"]["leave_status"] | null
          user_id: string | null
        }
        Relationships: [
          {
            foreignKeyName: "leave_requests_user_profile_fkey"
            columns: ["user_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
        ]
      }
    }
    Functions: {
      admin_get_leave_requests: {
        Args: { _status?: Database["public"]["Enums"]["leave_status"] }
        Returns: {
          admin_comment: string | null
          created_at: string
          days: number
          decided_at: string | null
          decided_by: string | null
          end_date: string
          id: string
          leave_type: Database["public"]["Enums"]["leave_type"]
          reason: string | null
          start_date: string
          status: Database["public"]["Enums"]["leave_status"]
          updated_at: string
          user_id: string
        }[]
        SetofOptions: {
          from: "*"
          to: "leave_requests"
          isOneToOne: false
          isSetofReturn: true
        }
      }
      get_my_leave_requests: {
        Args: never
        Returns: {
          admin_comment: string | null
          created_at: string
          days: number
          decided_at: string | null
          decided_by: string | null
          end_date: string
          id: string
          leave_type: Database["public"]["Enums"]["leave_type"]
          reason: string | null
          start_date: string
          status: Database["public"]["Enums"]["leave_status"]
          updated_at: string
          user_id: string
        }[]
        SetofOptions: {
          from: "*"
          to: "leave_requests"
          isOneToOne: false
          isSetofReturn: true
        }
      }
    }
    Enums: {
      app_role: "admin" | "employee" | "project_manager" | "hr_admin"
      employee_doc_type:
        | "offer_letter"
        | "aadhar"
        | "pan"
        | "cancelled_cheque"
        | "marksheet_10"
        | "marksheet_12"
        | "graduation"
        | "masters"
        | "resume"
        | "profile_picture"
      leave_status: "pending" | "approved" | "rejected"
      leave_type: "casual" | "sick" | "earned" | "unpaid"
      project_status: "active" | "on_hold" | "completed"
      task_priority: "low" | "medium" | "high"
      task_recurrence: "none" | "weekly" | "monthly"
      task_status: "todo" | "in_progress" | "done"
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
      app_role: ["admin", "employee", "project_manager", "hr_admin"],
      employee_doc_type: [
        "offer_letter",
        "aadhar",
        "pan",
        "cancelled_cheque",
        "marksheet_10",
        "marksheet_12",
        "graduation",
        "masters",
        "resume",
        "profile_picture",
      ],
      leave_status: ["pending", "approved", "rejected"],
      leave_type: ["casual", "sick", "earned", "unpaid"],
      project_status: ["active", "on_hold", "completed"],
      task_priority: ["low", "medium", "high"],
      task_recurrence: ["none", "weekly", "monthly"],
      task_status: ["todo", "in_progress", "done"],
    },
  },
} as const
