"use client";

import { createContext, useContext, useEffect, useState, type ReactNode } from "react";

import {
  allowsSamsungdangFeature,
  getCurrentMembershipFeatureGate,
  loadCurrentMembershipFeatureGate,
  type MembershipFeatureGate,
  type SamsungdangFeature
} from "../membership-gate.mjs";
import { MEMBERSHIP_CHANGED_EVENT } from "../membership-store.mjs";

const MembershipFeatureGateContext = createContext<MembershipFeatureGate>(
  getCurrentMembershipFeatureGate()
);

export function MembershipFeatureGateProvider({ children }: { children: ReactNode }) {
  const [gate, setGate] = useState<MembershipFeatureGate>(getCurrentMembershipFeatureGate);

  useEffect(() => {
    let active = true;
    const reload = () => {
      loadCurrentMembershipFeatureGate().then((nextGate) => {
        if (active) setGate(nextGate);
      });
    };
    reload();
    window.addEventListener(MEMBERSHIP_CHANGED_EVENT, reload);
    return () => {
      active = false;
      window.removeEventListener(MEMBERSHIP_CHANGED_EVENT, reload);
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
