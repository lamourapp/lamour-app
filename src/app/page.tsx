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
      {screen === "journal" && <JournalScreen />}
      {screen === "staff" && <StaffScreen />}
      {screen === "dashboard" && <DashboardScreen />}
      {screen === "settings" && <SettingsScreen />}
    </>
  );
}
