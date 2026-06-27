"use client";

import { useState } from "react";
import { Loader2, MapPin } from "lucide-react";
import type { FeasibilityProject } from "@/lib/types";
import { lookupBurbankParcel } from "@/lib/gis/burbank-lookup";
import { syncEnvelopeFromSitePlan } from "@/lib/geometry/site-plan";
import { Button, Card } from "@/components/ui/Form";

export function ParcelLookupPanel({
  project,
  onChange,
}: {
  project: FeasibilityProject;
  onChange: (p: FeasibilityProject) => void;
}) {
  const [loading, setLoading] = useState(false);
  const [message, setMessage] = useState<string | null>(
    project.sitePlan.lookupMessage ?? null
  );

  async function runLookup() {
    setLoading(true);
    setMessage(null);

    const result = await lookupBurbankParcel(project.property.address, {
      ain: project.property.apn,
      zone: project.property.zone,
    });

    setMessage(result.message);

    if (result.success && result.propertyPatch && result.sitePlanPatch) {
      const sitePlan = {
        ...project.sitePlan,
        ...result.sitePlanPatch,
        lookupMessage: result.message,
      };
      const property = { ...project.property, ...result.propertyPatch };
      const envelope = syncEnvelopeFromSitePlan(
        sitePlan,
        project.envelope,
        property.frontSetbackFt
      );

      onChange({
        ...project,
        property,
        sitePlan,
        envelope,
      });
    }

    setLoading(false);
  }

  return (
    <Card className="border-sky-200 bg-sky-50">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <h3 className="text-sm font-semibold text-sky-900">
            GIS parcel lookup
          </h3>
          <p className="mt-1 text-xs text-sky-800">
            Geocodes address via OpenStreetMap, pulls parcel geometry from LA
            County Assessor, and resolves zoning from SCAG.
          </p>
        </div>
        <Button
          type="button"
          variant="secondary"
          onClick={runLookup}
          disabled={loading || !project.property.address.trim()}
          className="inline-flex shrink-0 items-center gap-2"
        >
          {loading ? (
            <Loader2 className="h-4 w-4 animate-spin" />
          ) : (
            <MapPin className="h-4 w-4" />
          )}
          Look up parcel
        </Button>
      </div>
      {message && (
        <p
          className={`mt-3 text-xs ${
            message.includes("loaded") || message.includes("Parcel")
              ? "text-emerald-800"
              : "text-amber-800"
          }`}
        >
          {message}
        </p>
      )}
      {project.sitePlan.lookupAt && (
        <p className="mt-1 font-mono text-[10px] text-sky-600">
          Last lookup: {new Date(project.sitePlan.lookupAt).toLocaleString()}
          {project.sitePlan.lookupSource === "lacounty_assessor" &&
            " · LA County Assessor"}
        </p>
      )}
    </Card>
  );
}
