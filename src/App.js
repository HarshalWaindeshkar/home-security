// App.js
import React, { useEffect, useState, useRef } from "react";
import "./App.css";

/*
 Home Security System
 - Sensors: Door, Window, Motion, Camera, Smoke
 - Arm/Disarm, Alarm, Logs, Manual/Simulated triggers
 - Fixed Garage Camera trigger logic
 - Alarm stops manually if Trigger is clicked again while ringing
*/

const initialSensors = [
  {
    id: 1,
    name: "Front Door",
    type: "door",
    state: "closed",
    lastEvent: null,
    history: [],
  },
  {
    id: 2,
    name: "Back Window",
    type: "window",
    state: "closed",
    lastEvent: null,
    history: [],
  },
  {
    id: 3,
    name: "Living Room Motion",
    type: "motion",
    state: "idle",
    lastEvent: null,
    history: [],
  },
  {
    id: 4,
    name: "Garage Camera",
    type: "camera",
    state: "ok",
    lastEvent: null,
    history: [],
  },
  {
    id: 5,
    name: "Kitchen Smoke",
    type: "smoke",
    state: "ok",
    lastEvent: null,
    history: [],
  },
];

const STORAGE_KEY = "home_security_state_v1";

function nowISO() {
  return new Date().toISOString();
}
function formatTime(iso) {
  return new Date(iso).toLocaleString("en-IN");
}

function App() {
  const [sensors, setSensors] = useState(() => {
    try {
      const saved = localStorage.getItem(STORAGE_KEY);
      if (saved) return JSON.parse(saved).sensors;
    } catch (e) {}
    return initialSensors;
  });

  const [armed, setArmed] = useState(() => {
    try {
      const saved = localStorage.getItem(STORAGE_KEY);
      if (saved) return JSON.parse(saved).armed;
    } catch (e) {}
    return false;
  });

  const [logs, setLogs] = useState(() => {
    try {
      const saved = localStorage.getItem(STORAGE_KEY);
      if (saved) return JSON.parse(saved).logs;
    } catch (e) {}
    return [];
  });

  const [showModal, setShowModal] = useState(false);
  const [selectedSensor, setSelectedSensor] = useState(null);
  const [simulate, setSimulate] = useState(true);
  const [alarmOn, setAlarmOn] = useState(false);
  const alarmAudioRef = useRef(null);

  // persist data
  useEffect(() => {
    localStorage.setItem(STORAGE_KEY, JSON.stringify({ sensors, armed, logs }));
  }, [sensors, armed, logs]);

  // ---------- Alarm sound setup ----------
  useEffect(() => {
    function initAudioContext() {
      if (alarmAudioRef.current) return;

      const ctx = new (window.AudioContext || window.webkitAudioContext)();
      const oscillator = ctx.createOscillator();
      const gain = ctx.createGain();

      oscillator.type = "sine";
      oscillator.frequency.value = 900;
      gain.gain.value = 0;

      oscillator.connect(gain);
      gain.connect(ctx.destination);
      oscillator.start();

      alarmAudioRef.current = { ctx, oscillator, gain, playing: false };
      console.log("AudioContext initialized");
    }

    window.addEventListener("click", initAudioContext, { once: true });
    window.addEventListener("keydown", initAudioContext, { once: true });

    return () => {
      window.removeEventListener("click", initAudioContext);
      window.removeEventListener("keydown", initAudioContext);
    };
  }, []);

  // toggle alarm sound
  useEffect(() => {
    const node = alarmAudioRef.current;
    if (!node) return;
    if (alarmOn && !node.playing) {
      node.gain.gain.linearRampToValueAtTime(0.2, node.ctx.currentTime + 0.05);
      node.playing = true;
    } else if (!alarmOn && node.playing) {
      node.gain.gain.linearRampToValueAtTime(0.0, node.ctx.currentTime + 0.05);
      node.playing = false;
    }
  }, [alarmOn]);

  // Simulate (optional)
  useEffect(() => {
    if (!simulate) return;
    const interval = setInterval(() => {
      const chance = Math.random();
      if (chance < 0.3) {
        const idx = Math.floor(Math.random() * sensors.length);
        simulateSensorEvent(sensors[idx].id);
      }
    }, 5000);
    return () => clearInterval(interval);
  }, [simulate, sensors]);

  // Sensor event handler
  function simulateSensorEvent(sensorId, forcedState = null) {
    setSensors((prev) =>
      prev.map((s) => {
        if (s.id !== sensorId) return s;
        const eventTime = nowISO();
        let newState = s.state;

        // 🔇 If alarm is ON and Trigger clicked again -> stop alarm immediately
        if (alarmOn) {
          setAlarmOn(false);
          pushLog(`🔕 Alarm stopped manually via ${s.name}`, eventTime);
          return s; // do not change state while silencing alarm
        }

        // Custom trigger logic per sensor type
        if (forcedState) {
          newState = forcedState;
        } else if (s.type === "door" || s.type === "window") {
          newState = s.state === "open" ? "closed" : "open";
        } else if (s.type === "motion") {
          newState = s.state === "motion" ? "idle" : "motion";
        } else if (s.type === "camera") {
          newState = s.state === "ok" ? "alert" : "ok";
        } else if (s.type === "smoke") {
          newState = s.state === "alarm" ? "ok" : "alarm";
        } else {
          newState = s.state === "ok" ? "alert" : "ok";
        }

        const event = {
          time: eventTime,
          type: newState,
          note: `${s.name} → ${newState}`,
        };
        const newHistory = [event, ...s.history].slice(0, 30);

        // log state change
        pushLog(`${s.name} — ${newState}`, eventTime);

        // ✅ Trigger alarm if ANY abnormal activity occurs while armed
        if (
          armed &&
          (newState === "open" ||
            newState === "motion" ||
            newState === "alarm" ||
            newState === "alert")
        ) {
          setAlarmOn(true);
          pushLog(
            `🚨 ALARM TRIGGERED: ${s.name} detected activity while system armed`,
            eventTime
          );
        }

        return {
          ...s,
          state: newState,
          lastEvent: eventTime,
          history: newHistory,
        };
      })
    );
  }

  function pushLog(message, time) {
    setLogs((prev) =>
      [{ message, time: time || nowISO() }, ...prev].slice(0, 200)
    );
  }

  function openSensorModal(sensor) {
    setSelectedSensor(sensor);
    setShowModal(true);
  }

  function performSensorAck(sensorId) {
    setSensors((prev) =>
      prev.map((s) =>
        s.id === sensorId
          ? {
              ...s,
              state:
                s.type === "motion"
                  ? "idle"
                  : s.type === "smoke"
                  ? "ok"
                  : s.type === "camera"
                  ? "ok"
                  : "closed",
            }
          : s
      )
    );
    pushLog(`Acknowledged ${selectedSensor?.name}`, nowISO());
    setAlarmOn(false);
  }

  function armSystem() {
    setArmed(true);
    pushLog("System armed", nowISO());
  }

  function disarmSystem() {
    setArmed(false);
    setAlarmOn(false);
    pushLog("System disarmed", nowISO());
  }

  function quickToggle(sensor) {
    simulateSensorEvent(sensor.id);
  }

  return (
    <div className="app-container">
      <header className="header">
        <div className="header-content">
          <div className="logo-section">
            <div className="logo">🏠</div>
            <div>
              <h1>Home Security System</h1>
              <p className="subtitle">Real-time monitoring · Alarm · Logs</p>
            </div>
          </div>

          <div className="stats" style={{ alignItems: "center" }}>
            <div className={`stat-card ${armed ? "available" : ""}`}>
              <span className="stat-number">
                {armed ? "Armed" : "Disarmed"}
              </span>
              <span className="stat-label">{armed ? "🔒" : "🔓"}</span>
            </div>

            <div className={`stat-card ${alarmOn ? "occupied" : ""}`}>
              <span className="stat-number">{alarmOn ? "ALARM" : "OK"}</span>
              <span className="stat-label">{alarmOn ? "🚨" : "✅"}</span>
            </div>
          </div>
        </div>
      </header>

      <main className="main-content">
        <div className="info-banner">
          <p>📍 System time: {new Date().toLocaleString("en-IN")}</p>
          <div style={{ display: "flex", gap: "0.8rem", alignItems: "center" }}>
            <button
              className="btn btn-primary"
              onClick={() => (armed ? disarmSystem() : armSystem())}
            >
              {armed ? "Disarm System" : "Arm System"}
            </button>

            <button
              className="btn btn-cancel"
              onClick={() => {
                setSimulate((s) => !s);
                pushLog(`Simulation ${simulate ? "disabled" : "enabled"}`);
              }}
            >
              {simulate ? "Stop Simulation" : "Start Simulation"}
            </button>

            <button
              className="btn btn-success"
              onClick={() => {
                setLogs([]);
                pushLog("Cleared logs");
              }}
            >
              Clear Logs
            </button>

            <label
              style={{
                display: "flex",
                alignItems: "center",
                gap: "0.4rem",
                marginLeft: "0.75rem",
              }}
            >
              <input
                type="checkbox"
                checked={alarmOn}
                onChange={() => {
                  setAlarmOn(!alarmOn);
                  pushLog(alarmOn ? "Alarm silenced" : "Alarm sounded");
                }}
              />
              Sound Alarm
            </label>
          </div>
        </div>

        <div className="parking-grid">
          {sensors.map((sensor) => (
            <div
              key={sensor.id}
              className={`parking-spot ${
                ["open", "motion", "alarm", "alert"].includes(sensor.state)
                  ? "occupied"
                  : "available"
              }`}
              onClick={() => openSensorModal(sensor)}
            >
              <div className="spot-header">
                <span className="spot-location">{sensor.name}</span>
                <span
                  className={`status-badge ${
                    ["open", "motion", "alarm", "alert"].includes(sensor.state)
                      ? "badge-occupied"
                      : "badge-available"
                  }`}
                >
                  {sensor.state === "open" && "🚪 Open"}
                  {sensor.state === "closed" && "🔒 Closed"}
                  {sensor.state === "idle" && "🕊️ Idle"}
                  {sensor.state === "motion" && "🕵️ Motion"}
                  {sensor.state === "alarm" && "🔥 Smoke"}
                  {sensor.state === "ok" && "✅ OK"}
                  {sensor.state === "alert" && "📷 Alert"}
                </span>
              </div>

              <div className="booking-info">
                <p>
                  <strong>Type:</strong> {sensor.type}
                </p>
                <p>
                  <strong>Last:</strong>{" "}
                  {sensor.lastEvent ? formatTime(sensor.lastEvent) : "—"}
                </p>
                <div
                  style={{
                    marginTop: "0.75rem",
                    display: "flex",
                    gap: "0.5rem",
                  }}
                >
                  <button
                    className="btn btn-primary"
                    onClick={(e) => {
                      e.stopPropagation();
                      quickToggle(sensor);
                    }}
                  >
                    Trigger
                  </button>
                  <button
                    className="btn btn-cancel"
                    onClick={(e) => {
                      e.stopPropagation();
                      pushLog(`Checked ${sensor.name}`);
                    }}
                  >
                    Check
                  </button>
                </div>
              </div>
            </div>
          ))}
        </div>

        {/* Logs */}
        <div style={{ marginTop: "2rem" }}>
          <h3 style={{ color: "#fff", marginBottom: "0.6rem" }}>Event Log</h3>
          <div
            style={{
              background: "rgba(255,255,255,0.95)",
              padding: "1rem",
              borderRadius: "12px",
              maxHeight: "240px",
              overflow: "auto",
            }}
          >
            {logs.length === 0 ? (
              <p style={{ color: "#4a5568" }}>No events yet.</p>
            ) : (
              logs.map((l, i) => (
                <div
                  key={i}
                  style={{
                    padding: "0.45rem 0",
                    borderBottom: "1px solid #e2e8f0",
                  }}
                >
                  <div
                    style={{ display: "flex", justifyContent: "space-between" }}
                  >
                    <strong style={{ color: "#2d3748" }}>{l.message}</strong>
                    <span style={{ color: "#718096" }}>
                      {formatTime(l.time)}
                    </span>
                  </div>
                </div>
              ))
            )}
          </div>
        </div>
      </main>
    </div>
  );
}

export default App;
