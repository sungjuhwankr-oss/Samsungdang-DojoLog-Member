"use client";

import { createContext, useContext, useEffect, useState, type ReactNode } from "react";

import {
  allowsSamsungdangFeature,
  getCurrentMembershipFeatureGate,
  loadCurrentMembershipFeatureGate,
  type MembershipFeatureGate,
  type SamsungdangFeature
} from "../membership-gate.mjs";

const MembershipFeatureGateContext = createContext<MembershipFeatureGate>(
  getCurrentMembershipFeatureGate()
);

export function MembershipFeatureGateProvider({ children }: { children: ReactNode }) {
  const [gate, setGate] = useState<MembershipFeatureGate>(getCurrentMembershipFeatureGate);

  useEffect(() => {
    let active = true;
    loadCurrentMembershipFeatureGate().then((nextGate) => {
      if (active) setGate(nextGate);
    });
    return () => {
      active = false;
    };
  }, []);

  return (
    <MembershipFeatureGateContext.Provider value={gate}>
      {children}
    </MembershipFeatureGateContext.Provider>
  );
}

export function SamsungdangFeatureBoundary({
  feature,
  children,
  fallback = null
}: {
  feature: SamsungdangFeature;
  children: ReactNode;
  fallback?: ReactNode;
}) {
  const gate = useContext(MembershipFeatureGateContext);
  return allowsSamsungdangFeature(gate, feature) ? children : fallback;
}
