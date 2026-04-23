import { useEffect, useMemo, useRef, useState } from "react";

import { fetchAccountProfile, saveAccountProfile } from "../api";
import { MARKET_INDEX_OPTIONS } from "../lib/marketIndexes";

const MARKET_TIME_ZONE_LABEL = "IST";
const DEFAULT_MARKET_START_TIME = "09:00";
const DEFAULT_MARKET_END_TIME = "15:45";
const TIME_VALUE_PATTERN = /^(?:[01]\d|2[0-3]):[0-5]\d$/;

const SETTINGS_TABS = [
  { id: "profile", label: "Profile", note: "Identity and broker profile" },
  { id: "watchlist", label: "Watchlist", note: "Symbols used across the app" },
  { id: "configuration", label: "Configuration", note: "Workspace behavior and defaults" },
];

function splitName(fullName) {
  const parts = String(fullName || "").trim().split(/\s+/).filter(Boolean);
  if (!parts.length) {
    return { firstName: "TradeBuddy", lastName: "User" };
  }
  return {
    firstName: parts[0],
    lastName: parts.slice(1).join(" "),
  };
}

function buildBaseProfile(profile) {
  const fullName = profile?.name || profile?.display_name || profile?.fy_id || "TradeBuddy User";
  const { firstName, lastName } = splitName(fullName);

  return {
    firstName,
    lastName,
    email: profile?.email_id || profile?.email || "",
    phone: profile?.mobile_number || profile?.phone_number || profile?.phone || "",
    state: "",
    city: "",
    timezone: Intl.DateTimeFormat().resolvedOptions().timeZone || "Asia/Kolkata",
    avatarUrl: "",
    avatarDataUrl: "",
    avatarUpdatedAt: "",
  };
}

function composeDisplayName(accountProfile) {
  return `${accountProfile.firstName || ""} ${accountProfile.lastName || ""}`.trim() || "TradeBuddy User";
}

function composeLocation(accountProfile) {
  return [accountProfile.city, accountProfile.state].filter(Boolean).join(", ") || "Location not set";
}

function profileInitials(accountProfile) {
  return composeDisplayName(accountProfile)
    .split(/\s+/)
    .filter(Boolean)
    .slice(0, 2)
    .map((part) => part[0]?.toUpperCase() || "")
    .join("");
}

function mergeAccountProfile(baseProfile, storedProfile = {}) {
  return {
    ...baseProfile,
    ...storedProfile,
    avatarUrl: String(storedProfile?.avatarUrl || ""),
    avatarUpdatedAt: String(storedProfile?.avatarUpdatedAt || ""),
    avatarDataUrl: "",
  };
}

function getAvatarSource(accountProfile) {
  return accountProfile.avatarDataUrl || accountProfile.avatarUrl || "";
}

function normalizeTimeValue(value, fallback) {
  const normalized = String(value || "").trim();
  return TIME_VALUE_PATTERN.test(normalized) ? normalized : fallback;
}

function formatTimeValue(value, fallback) {
  const normalized = normalizeTimeValue(value, fallback);
  const [hour, minute] = normalized.split(":").map(Number);
  return new Intl.DateTimeFormat(undefined, {
    hour: "numeric",
    minute: "2-digit",
  }).format(new Date(2000, 0, 1, hour, minute));
}

function loadImage(url) {
  return new Promise((resolve, reject) => {
    const image = new Image();
    image.onload = () => resolve(image);
    image.onerror = () => reject(new Error("Unable to read the selected picture."));
    image.src = url;
  });
}

async function convertImageToJpegDataUrl(file) {
  const objectUrl = URL.createObjectURL(file);
  try {
    const image = await loadImage(objectUrl);
    const maxSize = 640;
    const scale = Math.min(1, maxSize / image.width, maxSize / image.height);
    const width = Math.max(1, Math.round(image.width * scale));
    const height = Math.max(1, Math.round(image.height * scale));
    const canvas = document.createElement("canvas");
    canvas.width = width;
    canvas.height = height;

    const context = canvas.getContext("2d");
    if (!context) {
      throw new Error("Image conversion is not supported in this browser.");
    }

    context.fillStyle = "#ffffff";
    context.fillRect(0, 0, width, height);
    context.drawImage(image, 0, 0, width, height);

    const dataUrl = canvas.toDataURL("image/jpeg", 0.9);
    if (!dataUrl.startsWith("data:image/jpeg")) {
      throw new Error("Unable to convert the selected picture to JPEG.");
    }

    return dataUrl;
  } finally {
    URL.revokeObjectURL(objectUrl);
  }
}

export default function SettingsPage({
  profile,
  settings,
  watchlistDraft,
  watchlistSymbols,
  onWatchlistDraftChange,
  onAddWatchlistSymbol,
  onRemoveWatchlistSymbol,
  onSettingsChange,
  onAccountProfileSaved,
}) {
  const baseProfile = useMemo(() => buildBaseProfile(profile), [
    profile?.name,
    profile?.display_name,
    profile?.fy_id,
    profile?.email_id,
    profile?.email,
    profile?.mobile_number,
    profile?.phone_number,
    profile?.phone,
  ]);
  const [accountProfile, setAccountProfile] = useState(baseProfile);
  const [profileNotice, setProfileNotice] = useState("");
  const [profileNoticeTone, setProfileNoticeTone] = useState("success");
  const [savingProfile, setSavingProfile] = useState(false);
  const [activeTab, setActiveTab] = useState("profile");
  const fileInputRef = useRef(null);

  useEffect(() => {
    let ignore = false;

    async function loadSavedAccountProfile() {
      try {
        const result = await fetchAccountProfile();
        if (ignore) {
          return;
        }
        setAccountProfile(mergeAccountProfile(baseProfile, result?.profile));
      } catch {
        if (!ignore) {
          setAccountProfile(baseProfile);
        }
      }
    }

    void loadSavedAccountProfile();
    return () => {
      ignore = true;
    };
  }, [baseProfile]);

  function handleAccountProfileChange(event) {
    const { name, value } = event.target;
    setAccountProfile((current) => ({
      ...current,
      [name]: value,
    }));
  }

  async function handleAvatarUpload(event) {
    const file = event.target.files?.[0];
    if (!file) {
      return;
    }

    try {
      const avatarDataUrl = await convertImageToJpegDataUrl(file);
      setAccountProfile((current) => ({
        ...current,
        avatarDataUrl,
      }));
      setProfileNoticeTone("success");
      setProfileNotice("Profile picture ready. Save details to upload it as a JPEG.");
    } catch (error) {
      setProfileNoticeTone("error");
      setProfileNotice(error.message || "Unable to process the selected picture.");
    } finally {
      event.target.value = "";
    }
  }

  async function handleAccountProfileSave(event) {
    event.preventDefault();

    try {
      setSavingProfile(true);
      const result = await saveAccountProfile({
        ...accountProfile,
        brokerAccount: profile?.fy_id || profile?.display_name || "",
      });
      setAccountProfile(mergeAccountProfile(baseProfile, result?.profile));
      onAccountProfileSaved?.(result?.profile || null);
      setProfileNoticeTone("success");
      setProfileNotice("Account details saved to the server profile folder.");
    } catch (error) {
      setProfileNoticeTone("error");
      setProfileNotice(error.message || "Unable to save account details.");
    } finally {
      setSavingProfile(false);
    }
  }

  const avatarSource = getAvatarSource(accountProfile);
  const watchlistCount = watchlistSymbols.length;
  const defaultChartLabel = useMemo(() => {
    return MARKET_INDEX_OPTIONS.find((option) => option.value === settings.defaultChartSymbol)?.label || settings.defaultChartSymbol;
  }, [settings.defaultChartSymbol]);
  const marketWindowLabel = useMemo(() => {
    return `${formatTimeValue(settings.marketStartTime, DEFAULT_MARKET_START_TIME)} - ${formatTimeValue(settings.marketEndTime, DEFAULT_MARKET_END_TIME)} ${MARKET_TIME_ZONE_LABEL}`;
  }, [settings.marketEndTime, settings.marketStartTime]);

  return (
    <div className="settings-page">
      <div className="settings-page-head">
        <div>
          <h3>Account</h3>
          <p>Manage your profile details alongside workspace preferences with server-backed storage.</p>
        </div>
      </div>

      <div className="settings-tabs" role="tablist" aria-label="Settings sections">
        {SETTINGS_TABS.map((tab) => {
          return (
            <button
              key={tab.id}
              type="button"
              role="tab"
              aria-selected={activeTab === tab.id}
              className={`settings-tab${activeTab === tab.id ? " is-active" : ""}`}
              onClick={() => setActiveTab(tab.id)}
            >
              <span className="settings-tab-label">{tab.label}</span>
              <span className="settings-tab-note">{tab.note}</span>
            </button>
          );
        })}
      </div>

      {activeTab === "profile" ? (
        <div className="settings-account-grid">
          <div className="panel settings-account-card">
            <div className="settings-account-card-body">
              <div className="settings-account-avatar-shell">
                {avatarSource ? (
                  <img className="settings-account-avatar-image" src={avatarSource} alt={composeDisplayName(accountProfile)} />
                ) : (
                  <div className="settings-account-avatar-fallback">{profileInitials(accountProfile)}</div>
                )}
              </div>

              <h4>{composeDisplayName(accountProfile)}</h4>
              <p>{composeLocation(accountProfile)}</p>
              <p className="settings-account-timezone">{accountProfile.timezone || "Timezone not set"}</p>
              <p className="settings-account-submeta">{profile?.fy_id ? `FYERS ID: ${profile.fy_id}` : "Broker profile connected"}</p>
            </div>

            <div className="settings-account-card-foot">
              <input ref={fileInputRef} type="file" accept="image/*" hidden onChange={handleAvatarUpload} />
              <button type="button" className="btn-secondary settings-upload-btn" onClick={() => fileInputRef.current?.click()}>
                Upload picture
              </button>
            </div>
          </div>

          <div className="panel settings-profile-panel">
            <div className="panel-head">
              <div>
                <h3>Profile</h3>
                <p>The information in this section is editable and saved on the server. Uploaded pictures are stored in the profile folder as JPEG files.</p>
              </div>
            </div>

            <form className="settings-profile-form" onSubmit={handleAccountProfileSave}>
              <div className="settings-profile-form-body form-grid">
                <div className="form-row-2">
                  <label>
                    First name
                    <input name="firstName" value={accountProfile.firstName} onChange={handleAccountProfileChange} />
                  </label>
                  <label>
                    Last name
                    <input name="lastName" value={accountProfile.lastName} onChange={handleAccountProfileChange} />
                  </label>
                </div>

                <div className="form-row-2">
                  <label>
                    Email address
                    <input name="email" type="email" value={accountProfile.email} onChange={handleAccountProfileChange} />
                  </label>
                  <label>
                    Phone number
                    <input name="phone" value={accountProfile.phone} onChange={handleAccountProfileChange} />
                  </label>
                </div>

                <div className="form-row-2">
                  <label>
                    State
                    <input name="state" value={accountProfile.state} onChange={handleAccountProfileChange} />
                  </label>
                  <label>
                    City
                    <input name="city" value={accountProfile.city} onChange={handleAccountProfileChange} />
                  </label>
                </div>

                <div className="form-row-2">
                  <label>
                    Timezone
                    <input name="timezone" value={accountProfile.timezone} onChange={handleAccountProfileChange} />
                  </label>
                  <label>
                    Broker account
                    <input value={profile?.fy_id || profile?.display_name || "Connected FYERS account"} readOnly />
                  </label>
                </div>
              </div>

              <div className="settings-profile-actions">
                <button type="submit" className="btn-primary" disabled={savingProfile}>{savingProfile ? "Saving..." : "Save details"}</button>
              </div>
            </form>

            {profileNotice ? <p className={profileNoticeTone === "error" ? "error-text" : "success-text"}>{profileNotice}</p> : null}
          </div>
        </div>
      ) : null}

      {activeTab === "watchlist" ? (
        <div className="panel settings-workspace-panel settings-tab-panel">
          <div className="panel-head">
            <div>
              <h3>Watchlist</h3>
              <p>Manage the symbols that are persisted in this browser, plus the default index used for the Markets chart.</p>
            </div>
            <span className="settings-tab-badge">{watchlistCount} symbols</span>
          </div>

          <div className="settings-tab-panel-body form-grid">
            <div className="form-row-2">
              <label>
                Default Index
                <select name="defaultChartSymbol" value={settings.defaultChartSymbol} onChange={onSettingsChange}>
                  {MARKET_INDEX_OPTIONS.map((option) => (
                    <option key={option.value} value={option.value}>{option.label}</option>
                  ))}
                </select>
              </label>
              <div className="settings-config-card">
                <strong>Current chart default</strong>
                <span>{defaultChartLabel}</span>
                <small>Markets will open with this index until you click another symbol.</small>
              </div>
            </div>

            <label>
              Add Watchlist Symbol
              <div className="chip-input-row">
                <input value={watchlistDraft} onChange={onWatchlistDraftChange} placeholder="e.g. NSE:SBIN-EQ" />
                <button type="button" className="btn-primary" onClick={onAddWatchlistSymbol}>Add</button>
              </div>
            </label>

            <div className="chip-list">
              {watchlistSymbols.map((symbol) => (
                <button key={symbol} type="button" className="chip" onClick={() => onRemoveWatchlistSymbol(symbol)}>{symbol} ×</button>
              ))}
            </div>

            {!watchlistSymbols.length ? <p className="settings-tab-hint">Add symbols here to make them available across the dashboard, markets, and portfolio workflows.</p> : null}
          </div>
        </div>
      ) : null}

      {activeTab === "configuration" ? (
        <div className="panel settings-workspace-panel settings-tab-panel">
          <div className="panel-head">
            <div>
              <h3>Configuration</h3>
              <p>These preferences persist in your browser and control when live market data should stream automatically in the {MARKET_TIME_ZONE_LABEL} session.</p>
            </div>
          </div>

          <div className="settings-tab-panel-body form-grid">
            <div className="form-row-2">
              <label>
                Market Start Time ({MARKET_TIME_ZONE_LABEL})
                <input name="marketStartTime" type="time" step="60" value={normalizeTimeValue(settings.marketStartTime, DEFAULT_MARKET_START_TIME)} onChange={onSettingsChange} />
              </label>
              <label>
                Market End Time ({MARKET_TIME_ZONE_LABEL})
                <input name="marketEndTime" type="time" step="60" value={normalizeTimeValue(settings.marketEndTime, DEFAULT_MARKET_END_TIME)} onChange={onSettingsChange} />
              </label>
            </div>

            <div className="form-row-2">
              <div className="settings-config-card">
                <strong>Live data window</strong>
                <span>{marketWindowLabel}</span>
                <small>Automatic live quotes, reconnect attempts, and market polling only run inside this {MARKET_TIME_ZONE_LABEL} session.</small>
              </div>
              <div className="settings-config-card">
                <strong>Save behavior</strong>
                <span>Auto saved</span>
                <small>Changes are stored instantly in this browser and applied across the dashboard and markets live feeds.</small>
              </div>
            </div>

            <p className="settings-tab-hint">Workspace configuration saves automatically in this browser. Outside the configured market window, automatic live streams stay paused and the latest recorded LTP snapshot remains visible.</p>
          </div>
        </div>
      ) : null}
    </div>
  );
}