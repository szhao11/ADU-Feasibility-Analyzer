"use client";

import type { FeasibilityProject } from "@/lib/types";
import { TextInput, SelectInput, Checkbox, Card } from "@/components/ui/Form";
import { ParcelLookupPanel } from "@/components/feasibility/ParcelLookupPanel";

const ZONES = [
  { value: "R-1", label: "R-1 — Single Family" },
  { value: "R-1-H", label: "R-1-H — Hillside Single Family" },
  { value: "R2", label: "R2 — Two Family" },
  { value: "R3", label: "R3 — Multi Family" },
  { value: "R4", label: "R4 — Multi Family" },
  { value: "MDR-3", label: "MDR-3 — Medium Density" },
  { value: "MDR-4", label: "MDR-4 — Medium Density" },
  { value: "OTHER", label: "Other / Unknown" },
];

export function StepProperty({
  project,
  onChange,
}: {
  project: FeasibilityProject;
  onChange: (p: FeasibilityProject) => void;
}) {
  const p = project.property;

  function updateProperty(patch: Partial<typeof p>) {
    onChange({
      ...project,
      property: { ...p, ...patch },
    });
  }

  function updateOverlay(
    key: keyof typeof p.overlays,
    value: boolean
  ) {
    onChange({
      ...project,
      property: {
        ...p,
        overlays: { ...p.overlays, [key]: value },
      },
    });
  }

  return (
    <div className="space-y-6">
      <div>
        <h2 className="text-lg font-semibold text-slate-900">Property intake</h2>
        <p className="mt-1 text-sm text-slate-500">
          Parcel geometry from LA County Assessor and zoning from SCAG. Override
          below if Planning confirms a different district.
        </p>
      </div>

      <ParcelLookupPanel project={project} onChange={onChange} />

      <div className="grid gap-4 sm:grid-cols-2">
        <TextInput
          label="Site address"
          value={p.address}
          onChange={(e) => updateProperty({ address: e.target.value })}
          placeholder="123 N Hollywood Way, Burbank, CA"
          className="sm:col-span-2"
        />
        <TextInput
          label="APN (optional)"
          value={p.apn ?? ""}
          onChange={(e) => updateProperty({ apn: e.target.value })}
          placeholder="Assessor parcel number"
        />
        <SelectInput
          label="Zoning district"
          value={p.zone}
          onChange={(e) =>
            updateProperty({
              zone: e.target.value as FeasibilityProject["property"]["zone"],
            })
          }
          options={ZONES}
        />
        <TextInput
          label="Lot area (sq ft)"
          type="number"
          value={p.lotSqFt ?? ""}
          onChange={(e) =>
            updateProperty({
              lotSqFt: e.target.value ? Number(e.target.value) : undefined,
            })
          }
        />
        <TextInput
          label="Primary dwelling (sq ft)"
          type="number"
          value={p.primarySqFt ?? ""}
          onChange={(e) =>
            updateProperty({
              primarySqFt: e.target.value ? Number(e.target.value) : undefined,
            })
          }
        />
        <TextInput
          label="Lot width (ft)"
          type="number"
          value={p.lotWidthFt ?? ""}
          onChange={(e) =>
            updateProperty({
              lotWidthFt: e.target.value ? Number(e.target.value) : undefined,
            })
          }
        />
        <TextInput
          label="Lot depth (ft)"
          type="number"
          value={p.lotDepthFt ?? ""}
          onChange={(e) =>
            updateProperty({
              lotDepthFt: e.target.value ? Number(e.target.value) : undefined,
            })
          }
        />
        <TextInput
          label="Front setback (ft)"
          type="number"
          value={p.frontSetbackFt ?? ""}
          onChange={(e) =>
            updateProperty({
              frontSetbackFt: e.target.value ? Number(e.target.value) : undefined,
            })
          }
        />
      </div>

      <Card>
        <h3 className="mb-3 text-sm font-semibold text-slate-800">
          Existing conditions
        </h3>
        <div className="space-y-2">
          <Checkbox
            label="Primary dwelling on lot"
            checked={p.hasPrimaryDwelling}
            onChange={(v) => updateProperty({ hasPrimaryDwelling: v })}
          />
          <Checkbox
            label="Garage or accessory structure present"
            checked={p.hasGarage}
            onChange={(v) => updateProperty({ hasGarage: v })}
          />
          {p.hasGarage && (
            <Checkbox
              label="Garage in front / street-facing yard"
              checked={p.garageInFrontYard ?? false}
              onChange={(v) => updateProperty({ garageInFrontYard: v })}
            />
          )}
        </div>
      </Card>

      <Card>
        <h3 className="mb-3 text-sm font-semibold text-slate-800">
          Overlays & exemptions
        </h3>
        <div className="space-y-2">
          <Checkbox
            label="Mountain Fire Zone"
            hint="Limits to one ADU or one JADU"
            checked={p.overlays.mountainFireZone}
            onChange={(v) => updateOverlay("mountainFireZone", v)}
          />
          <Checkbox
            label="Within ½ mile of public transit"
            hint="Parking exemption"
            checked={p.overlays.nearPublicTransitHalfMile}
            onChange={(v) => updateOverlay("nearPublicTransitHalfMile", v)}
          />
          <Checkbox
            label="Permit parking district"
            hint="Parking exemption"
            checked={p.overlays.permitParkingDistrict}
            onChange={(v) => updateOverlay("permitParkingDistrict", v)}
          />
          <Checkbox
            label="Near high-quality transit corridor"
            hint="Detached height up to 18'"
            checked={p.overlays.nearHighQualityTransit}
            onChange={(v) => updateOverlay("nearHighQualityTransit", v)}
          />
          <Checkbox
            label="Architecturally significant historic district"
            checked={p.overlays.historicDistrict}
            onChange={(v) => updateOverlay("historicDistrict", v)}
          />
        </div>
      </Card>
    </div>
  );
}
