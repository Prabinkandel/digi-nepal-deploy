const mongoose = require('mongoose');
module.exports = mongoose.model('Audit', new mongoose.Schema({ actor_id: String, action: String, target: String, outcome: { type: String, default: 'started' }, status: Number, detail: { type: String, default: '' } }, { timestamps: { createdAt: 'created_at', updatedAt: 'updated_at' } }));
