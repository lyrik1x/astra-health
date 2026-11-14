/** English UI texts (main MVP language). Every key used in the UI must exist here. */
export const en = {
  app: {
    name: "ASTRA HEALTH",
    skipToContent: "Skip to content",
  },
  banner: {
    label: "Prototype notices",
    educational: "Educational prototype — not a medical device",
    fictionalData: "Fictional data",
    simulated: "Simulated clock & delay",
  },
  demoRole: {
    label: "Demo mode",
    hint: "Not a login. Switches the demo view.",
    SHIP: "Ship",
    EARTH: "Earth",
    viewTag: "{{role}} view",
    invalid: "Unknown role “{{value}}” in the URL. Showing the default view: {{role}}.",
  },
  nav: {
    label: "Sections",
    dashboard: "Dashboard",
    recordMeasurement: "Record measurement",
    incident: "Incident",
    messages: "Messages",
    console: "Console",
  },
  pages: {
    placeholder: "Placeholder content. This section is built in a later ticket.",
    dashboard: {
      title: "Dashboard",
      description: "Overview of the crew member's recent records and transmissions.",
      recordAction: "Record a measurement",
    },
    recordMeasurement: {
      title: "Record measurement",
      description: "Manual entry of a measurement with fictional data.",
    },
    incident: {
      title: "Incident",
      description: "Incident record and explicit report to Earth.",
    },
    messages: {
      title: "Messages",
      description: "Messages between ship and Earth, delivered after the simulated delay.",
    },
    console: {
      title: "Console",
      description: "Earth console. It reads mission data only from the API.",
    },
  },
  status: {
    legendTitle: "Status legend",
    legendDescription: "How the app shows the state of each record and transmission.",
    SAVED_LOCAL: "Saved on device",
    PENDING_SYNC: "Queued",
    CONFIRMED: "Confirmed by channel",
    IN_TRANSIT: "In transit",
    DELIVERED: "Delivered",
    SYNC_ERROR: "Sync error",
    SYNC_ERROR_withCode: "Sync error: {{code}}",
    OFFLINE: "Offline",
  },
  api: {
    label: "API",
    checking: "Checking…",
    online: "Online",
    unreachable: "Unreachable",
    notConfigured: "Not configured",
  },
};
