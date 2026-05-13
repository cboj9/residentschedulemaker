const express = require('express');
const cors = require('cors');
const path = require('path');

const authRoutes = require('./routes/auth');
const programRoutes = require('./routes/programs');
const residentRoutes = require('./routes/residents');
const rotationRoutes = require('./routes/rotations');
const ptoRoutes = require('./routes/pto');
const scheduleRoutes = require('./routes/schedules');
const sickdayRoutes = require('./routes/sickdays');
const equityRoutes = require('./routes/equity');
const swapRoutes = require('./routes/swaps');
const jeopardyRoutes = require('./routes/jeopardy');
const changelogRoutes = require('./routes/changelog');
const sharedServicesRoutes = require('./routes/shared-services');
const leavePeriodsRoutes = require('./routes/leave-periods');
const electivePreferencesRoutes = require('./routes/elective-preferences');

const { initDb } = require('./db/schema');

const app = express();
const PORT = process.env.PORT || 3000;

app.use(cors());
app.use(express.json());
app.use(express.static(path.join(__dirname, 'public')));

// API routes
app.use('/api/auth', authRoutes);
app.use('/api/programs', programRoutes);
app.use('/api/residents', residentRoutes);
app.use('/api/rotations', rotationRoutes);
app.use('/api/pto', ptoRoutes);
app.use('/api/schedules', scheduleRoutes);
app.use('/api/sick-days', sickdayRoutes);
app.use('/api/equity', equityRoutes);
app.use('/api/swaps', swapRoutes);
app.use('/api/jeopardy', jeopardyRoutes);
app.use('/api/changelog', changelogRoutes);
app.use('/api/shared-services', sharedServicesRoutes);
app.use('/api/leave-periods', leavePeriodsRoutes);
app.use('/api/elective-preferences', electivePreferencesRoutes);

// SPA fallback — serve index.html for all non-API routes
app.get('*', (req, res) => {
  res.sendFile(path.join(__dirname, 'public', 'index.html'));
});

initDb()
  .then(() => {
    app.listen(PORT, () => {
      console.log(`Resident Scheduler running at http://localhost:${PORT}`);
    });
  })
  .catch(err => {
    console.error('Failed to initialize database:', err);
    process.exit(1);
  });
