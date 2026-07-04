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
      attendance_logs: {
        Row: {
          created_at: string
          daily_note: string | null
          date: string
          id: string
          next_actions: string | null
          punch_in_time: string | null
          punch_out_time: string | null
          tasks: Json
          total_hours: number | null
          updated_at: string
          user_id: string
        }
        Insert: {
          created_at?: string
          daily_note?: string | null
          date: string
          id?: string
          next_actions?: string | null
          punch_in_time?: string | null
          punch_out_time?: string | null
          tasks?: Json
          total_hours?: number | null
          updated_at?: string
          user_id: string
        }
        Update: {
          created_at?: string
          daily_note?: string | null
          date?: string
          id?: string
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
      google_calendar_tokens: {
        Row: {
          access_token: string
          connected_at: string
          expires_at: string
          google_email: string | null
          refresh_token: string | null
          scope: string | null
          updated_at: string
          user_id: string
        }
        Insert: {
          access_token: string
          connected_at?: string
          expires_at: string
          google_email?: string | null
          refresh_token?: string | null
          scope?: string | null
          updated_at?: string
          user_id: string
        }
        Update: {
          access_token?: string
          connected_at?: string
          expires_at?: string
          google_email?: string | null
          refresh_token?: string | null
          scope?: string | null
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
          department: string | null
          email: string | null
          employment_type: string | null
          full_name: string | null
          github_url: string | null
          id: string
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
          profile_picture_url: string | null
          standup_time: string | null
          updated_at: string
        }
        Insert: {
          avatar_url?: string | null
          created_at?: string
          date_of_birth?: string | null
          day_start_time?: string | null
          department?: string | null
          email?: string | null
          employment_type?: string | null
          full_name?: string | null
          github_url?: string | null
          id: string
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
          profile_picture_url?: string | null
          standup_time?: string | null
          updated_at?: string
        }
        Update: {
          avatar_url?: string | null
          created_at?: string
          date_of_birth?: string | null
          day_start_time?: string | null
          department?: string | null
          email?: string | null
          employment_type?: string | null
          full_name?: string | null
          github_url?: string | null
          id?: string
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
          profile_picture_url?: string | null
          standup_time?: string | null
          updated_at?: string
        }
        Relationships: []
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
          email: string
          is_super_admin: boolean
          role: Database["public"]["Enums"]["app_role"]
        }
        Insert: {
          created_at?: string
          default_monthly_salary?: number | null
          email: string
          is_super_admin?: boolean
          role?: Database["public"]["Enums"]["app_role"]
        }
        Update: {
          created_at?: string
          default_monthly_salary?: number | null
          email?: string
          is_super_admin?: boolean
          role?: Database["public"]["Enums"]["app_role"]
        }
        Relationships: []
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
      tasks: {
        Row: {
          assignee_id: string | null
          created_at: string
          created_by: string | null
          description: string | null
          due_date: string | null
          id: string
          priority: Database["public"]["Enums"]["task_priority"]
          project_id: string
          status: Database["public"]["Enums"]["task_status"]
          title: string
          updated_at: string
        }
        Insert: {
          assignee_id?: string | null
          created_at?: string
          created_by?: string | null
          description?: string | null
          due_date?: string | null
          id?: string
          priority?: Database["public"]["Enums"]["task_priority"]
          project_id: string
          status?: Database["public"]["Enums"]["task_status"]
          title: string
          updated_at?: string
        }
        Update: {
          assignee_id?: string | null
          created_at?: string
          created_by?: string | null
          description?: string | null
          due_date?: string | null
          id?: string
          priority?: Database["public"]["Enums"]["task_priority"]
          project_id?: string
          status?: Database["public"]["Enums"]["task_status"]
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
            foreignKeyName: "tasks_project_id_fkey"
            columns: ["project_id"]
            isOneToOne: false
            referencedRelation: "projects"
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
      task_status: ["todo", "in_progress", "done"],
    },
  },
} as const
