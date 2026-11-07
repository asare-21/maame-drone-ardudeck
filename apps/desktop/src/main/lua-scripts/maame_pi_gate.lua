-- MaameDrone Pi arming gate (ArduPilot Lua, Copter 4.7).
-- Copy to APM/scripts/ with modules/MAVLink/ next to it. Needs SCR_ENABLE=1.
--
-- Arming is allowed only while the Pi companion (MAVLink component 191) has sent
-- a HEARTBEAT with system_status ACTIVE within the last PI_TIMEOUT_MS.
--   SCR_USER1 = 1  bypass the gate (manual test flights only)
--   SCR_USER2      on Pi loss while armed: 0 = warn only, 1 = RTL from GUIDED,
--                  2 = RTL from GUIDED and AUTO
-- A runtime error keeps arming blocked.
-- PIG_VER (read-only marker) = the running gate version; ArduDeck uses it to
-- tell whether the gate is running and up to date.

local mavlink_msgs = require("MAVLink/mavlink_msgs")

local GATE_VERSION = 2
local PARAM_TABLE_KEY = 73   -- unique among this FC's Lua scripts
local PI_COMPID = 191
local MAV_STATE_ACTIVE = 4
local PI_TIMEOUT_MS = 3000
local LOOP_MS = 100
local MODE_AUTO, MODE_GUIDED, MODE_RTL = 3, 4, 6
local MAV_SEVERITY_WARNING, MAV_SEVERITY_INFO = 4, 6

local HEARTBEAT_ID = mavlink_msgs.get_msgid("HEARTBEAT")
local msg_map = { [HEARTBEAT_ID] = "HEARTBEAT" }

mavlink:init(10, 1)
mavlink:register_rx_msgid(HEARTBEAT_ID)

local auth_id = arming:get_aux_auth_id()
assert(auth_id, "Pi gate: no aux auth id")

-- After the auth id: if this fails the gate still blocks arming, only the marker is missing.
if param:add_table(PARAM_TABLE_KEY, "PIG_", 1) and param:add_param(PARAM_TABLE_KEY, 1, "VER", GATE_VERSION) then
  param:set("PIG_VER", GATE_VERSION)  -- running version, not saved
else
  gcs:send_text(MAV_SEVERITY_WARNING, "Pi gate: PIG_VER param unavailable")
end

local last_active_ms = nil   -- last ACTIVE heartbeat from the Pi
local pi_ok = false
local loss_handled = false   -- one reaction per loss while armed

local function now_ms()
  return millis():toint()
end

local function read_heartbeats()
  -- drain the queue each loop
  while true do
    local msg = mavlink:receive_chan()
    if msg == nil then return end
    local hb = mavlink_msgs.decode(msg, msg_map)
    if hb and hb.msgid == HEARTBEAT_ID and hb.compid == PI_COMPID
        and hb.system_status == MAV_STATE_ACTIVE then
      last_active_ms = now_ms()
    end
  end
end

local function on_pi_lost()
  local action = param:get("SCR_USER2") or 0
  local mode = vehicle:get_mode()
  if (mode == MODE_GUIDED and action >= 1) or (mode == MODE_AUTO and action >= 2) then
    vehicle:set_mode(MODE_RTL)
    gcs:send_text(MAV_SEVERITY_WARNING, "Pi companion lost: RTL")
  else
    gcs:send_text(MAV_SEVERITY_WARNING, "Pi companion lost")
  end
end

local function update()
  read_heartbeats()
  local was_ok = pi_ok
  pi_ok = last_active_ms ~= nil and (now_ms() - last_active_ms) < PI_TIMEOUT_MS

  if (param:get("SCR_USER1") or 0) == 1 then
    arming:set_aux_auth_passed(auth_id)
  elseif pi_ok then
    arming:set_aux_auth_passed(auth_id)
  else
    arming:set_aux_auth_failed(auth_id, "Pi companion not ready")
  end

  if pi_ok and not was_ok then
    gcs:send_text(MAV_SEVERITY_INFO, "Pi companion ready")
    loss_handled = false
  end
  if arming:is_armed() and not pi_ok and was_ok and not loss_handled then
    on_pi_lost()
    loss_handled = true
  end
end

local function protected_loop()
  local ok, err = pcall(update)
  if not ok then
    arming:set_aux_auth_failed(auth_id, "Pi gate script error")
    gcs:send_text(MAV_SEVERITY_WARNING, "Pi gate error: " .. tostring(err))
    return protected_loop, 1000
  end
  return protected_loop, LOOP_MS
end

arming:set_aux_auth_failed(auth_id, "Pi companion not ready")
gcs:send_text(MAV_SEVERITY_INFO, "Pi gate v" .. GATE_VERSION .. " loaded")
return protected_loop, LOOP_MS
