const mongoose = require('mongoose');

const auditSchema = new mongoose.Schema(
  {
    adminId: String,
    action: String,
    targetId: String,
    meta: { type: mongoose.Schema.Types.Mixed, default: {} },
  },
  { timestamps: true },
);

const AuditLog = mongoose.model('AuditLog', auditSchema);
module.exports = AuditLog;
