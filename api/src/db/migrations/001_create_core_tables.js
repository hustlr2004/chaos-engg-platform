exports.shorthands = undefined;

exports.up = (pgm) => {
  pgm.createTable("targets", {
    id: "id",
    name: {
      type: "text",
      notNull: true,
    },
    url: {
      type: "text",
      notNull: true,
    },
    stack: {
      type: "text",
    },
    image_name: {
      type: "text",
    },
    last_healthy_tag: {
      type: "text",
    },
    health_status: {
      type: "text",
      notNull: true,
      default: "unknown",
    },
    created_at: {
      type: "timestamp with time zone",
      notNull: true,
      default: pgm.func("current_timestamp"),
    },
  });

  pgm.createTable("experiments", {
    id: "id",
    name: {
      type: "text",
      notNull: true,
    },
    faults: {
      type: "jsonb",
      notNull: true,
      default: pgm.func("'[]'::jsonb"),
    },
    load_profile: {
      type: "jsonb",
      notNull: true,
      default: pgm.func("'{}'::jsonb"),
    },
    created_at: {
      type: "timestamp with time zone",
      notNull: true,
      default: pgm.func("current_timestamp"),
    },
  });

  pgm.createTable("runs", {
    id: "id",
    target_id: {
      type: "integer",
      notNull: true,
      references: "targets",
      onDelete: "cascade",
    },
    experiment_id: {
      type: "integer",
      references: "experiments",
      onDelete: "set null",
    },
    status: {
      type: "text",
      notNull: true,
      default: "queued",
    },
    started_at: {
      type: "timestamp with time zone",
    },
    ended_at: {
      type: "timestamp with time zone",
    },
    outcome: {
      type: "text",
    },
    k6_summary: {
      type: "jsonb",
      notNull: true,
      default: pgm.func("'{}'::jsonb"),
    },
  });

  pgm.createTable("repair_logs", {
    id: "id",
    run_id: {
      type: "integer",
      references: "runs",
      onDelete: "set null",
    },
    container_name: {
      type: "text",
      notNull: true,
    },
    violation_type: {
      type: "text",
      notNull: true,
    },
    repair_action: {
      type: "text",
      notNull: true,
    },
    outcome: {
      type: "text",
      notNull: true,
    },
    duration_ms: {
      type: "integer",
      notNull: true,
      default: 0,
    },
    created_at: {
      type: "timestamp with time zone",
      notNull: true,
      default: pgm.func("current_timestamp"),
    },
  });

  pgm.createIndex("runs", "status");
  pgm.createIndex("repair_logs", "container_name");
  pgm.createIndex("repair_logs", "created_at");
};

exports.down = (pgm) => {
  pgm.dropIndex("repair_logs", "created_at");
  pgm.dropIndex("repair_logs", "container_name");
  pgm.dropIndex("runs", "status");

  pgm.dropTable("repair_logs");
  pgm.dropTable("runs");
  pgm.dropTable("experiments");
  pgm.dropTable("targets");
};
