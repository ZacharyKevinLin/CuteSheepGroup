// Cloud production build: no personal data is stored in the public frontend.
// All member, meeting, prayer, interview, and permission data must be loaded
// from Supabase after authentication and filtered by database RLS policies.
window.INITIAL_DATA = {
  version: 24,
  groupName: '羊咩咩小組',
  leaders: {},
  members: [],
  meetings: [],
  interviews: [],
  permissions: {},
  optionSettings: {},
  accounts: {}
};
