"use client";

import { useState } from "react";
import Nav from "@/components/Nav";
import JournalScreen from "@/components/JournalScreen";
import StaffScreen from "@/components/StaffScreen";
import DashboardScreen from "@/components/DashboardScreen";
import SettingsScreen from "@/components/SettingsScreen";

type Screen = "journal" | "staff" | "dashboard" | "settings";

export default function Home() {
  const [screen, setScreen] = useState<Screen>("journal");

  return (
    <>
      <Nav active={screen} onNavigate={setScreen} />
      {/* Мобільний bottom-nav ~52px + safe-area. На sm+ його немає,
          JournalScreen має свій додатковий спейсер для quick-add. */}
      <div className="pb-[calc(56px+env(safe-area-inset-bottom))] sm:pb-0">
        {screen === "journal" && <JournalScreen />}
        {screen === "staff" && <StaffScreen />}
        {screen === "dashboard" && <DashboardScreen />}
        {screen === "settings" && <SettingsScreen />}
      </div>
    </>
  );
}
