// Onboarding stages and tasks configuration
// These are standardized - completion state is stored per client in the database

export interface OnboardingTask {
  key: string;
  label: string;
}

export interface OnboardingStage {
  stage: number;
  title: string;
  shortTitle: string;
  tasks: OnboardingTask[];
}

export const ONBOARDING_STAGES: OnboardingStage[] = [
  {
    stage: 1,
    title: "Post Signing Agreement",
    shortTitle: "Stage 1",
    tasks: [
      { key: "welcome_email_sent", label: "Welcome email sent" },
      { key: "ob_form_check", label: "Checking to see if OB form completed" },
      { key: "update_status_active", label: "Update status of client to active client" }
    ]
  },
  {
    stage: 2,
    title: "OB Form Completed - Client Set Up",
    shortTitle: "Stage 2",
    tasks: [
      { key: "create_google_drive", label: "Create client in google drive" },
      { key: "create_dashboard", label: "Create client in dashboard" },
      { key: "accounting_tracker", label: "Client added to accounting tracker" },
      { key: "login_details", label: "Client login details added to client profile in dashboard" },
      { key: "cold_call_sheet", label: "Cold call sheet created and saved in google drive + dashboard" },
      { key: "ob_call_scheduled", label: "Checking to see if OB call scheduled" },
      { key: "purchase_godaddy", label: "Purchase godaddy domain" },
      { key: "purchase_inbox", label: "Purchase premium inbox account" },
      { key: "add_close_pipeline", label: "Add client pipeline to fulfilment org on close" },
      { key: "setup_calendly", label: "Set up client on calendly" },
      { key: "setup_zapier", label: "Set up zapier" },
      { key: "watch_sales_calls", label: "Watch sales calls with Client" }
    ]
  },
  {
    stage: 3,
    title: "Onboarding Call (30 minutes)",
    shortTitle: "Stage 3",
    tasks: [
      { key: "give_launch_date", label: "Give client launch date" },
      { key: "walk_dashboard", label: "Walk client through dashboard" },
      { key: "integrate_calendar", label: "Integrate calendar" },
      { key: "schedule_catch_up", label: "Schedule weekly catch up" },
      { key: "client_responses", label: "Walk through client responses" },
      { key: "draft_script", label: "Walk through draft script" },
      { key: "expectation_setting", label: "Expectation setting" },
      { key: "things_to_win", label: "Things that our clients do to win" },
      { key: "campaign_end_deliverables", label: "At end of campaign, what client gets (warm leads created, some details)" },
      { key: "meetings_booked_tips", label: "Talk to them about how to get most out of meetings booked" },
      { key: "campaign_success_reasons", label: "Reasons why campaigns really work, here's why campaigns don't work/fail (Document to present)" },
      { key: "opportunity_definition", label: "Opportunity = new meeting and/or a new vacancy" },
      { key: "dig_deep_icp", label: "Dig deep: understand problem + ICP" },
      { key: "boundaries", label: "What we do and what we don't do (boundaries)" },
      { key: "insights_delivery", label: "Insights/delivery piece (average delivery, expected SDR metrics, connection rates, what months 1/2/3 look like)" },
      { key: "how_we_qualify", label: "How we qualify" },
      { key: "launch_process", label: "What happens from this point to campaign launch" },
      { key: "road_to_renewal", label: "Road to renewal: what needs to happen to renew" }
    ]
  },
  {
    stage: 4,
    title: "Campaign Asset Call",
    shortTitle: "Stage 4",
    tasks: [
      { key: "run_through_script", label: "Run through draft script" },
      { key: "run_through_lead_list", label: "Run through draft lead list" },
      { key: "schedule_launch_call", label: "Schedule launch call" }
    ]
  },
  {
    stage: 5,
    title: "Launch Call",
    shortTitle: "Stage 5",
    tasks: [
      { key: "confirm_happy", label: "Make sure they're happy with everything" },
      { key: "quick_expectations", label: "Quick expectation setting" }
    ]
  },
  {
    stage: 6,
    title: "Finalisation",
    shortTitle: "Stage 6",
    tasks: [
      { key: "implement_lead_list", label: "Implement lead list feedback and add to Close" },
      { key: "booking_info_check", label: "Double check that booking info on call sheet is correct" },
      { key: "notify_campaign_live", label: "Tell client the campaign is live via phonecall and/or slack" },
      { key: "trial_folders", label: "Add call sheets to trial folders" }
    ]
  }
];

// Get all tasks for a specific stage
export const getTasksForStage = (stageNumber: number): OnboardingTask[] => {
  const stage = ONBOARDING_STAGES.find(s => s.stage === stageNumber);
  return stage?.tasks || [];
};

// Get stage info by number
export const getStageInfo = (stageNumber: number): OnboardingStage | undefined => {
  return ONBOARDING_STAGES.find(s => s.stage === stageNumber);
};

// Get total number of tasks for a stage
export const getTotalTasksForStage = (stageNumber: number): number => {
  return getTasksForStage(stageNumber).length;
};

// Generate all task records for a new client onboarding
export const generateAllTasksForClient = (): { stage: number; task_key: string; task_label: string }[] => {
  const allTasks: { stage: number; task_key: string; task_label: string }[] = [];
  
  ONBOARDING_STAGES.forEach(stage => {
    stage.tasks.forEach(task => {
      allTasks.push({
        stage: stage.stage,
        task_key: task.key,
        task_label: task.label
      });
    });
  });
  
  return allTasks;
};
