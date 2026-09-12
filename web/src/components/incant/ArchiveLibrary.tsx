import { backupStatus, syncCloud, restoreCloud } from "@/lib/cloud-backup";
import { useEffect, useState } from "react";
import { allPairs, type Pair } from "@/lib/archive";
import { shareImage, saveImage } from "@/lib/share-image";
import type { Creation } from "@/lib/collection";
export function ArchiveLibrary({
  open,
  creations,
  onOpen,
  busy,
}: {
  open: boolean;
  creations: Creation[];
  onOpen: (c: Creation) => void;
  busy: boolean;
}) {
  const [pairs, setPairs] = useState<Pair[]>([]);
  const [error, setError] = useState("");
  const [cloud, setCloud] = useState(backupStatus);
  const [recovering, setRecovering] = useState(false);
  useEffect(() => {
    const update = () => setCloud(backupStatus);
    window.addEventListener("incant-backup-status", update);
    return () => window.removeEventListener("incant-backup-status", update);
  }, []);

  useEffect(() => {
    if (!open) return;
    let alive = true;
    void allPairs()
      .then((p) => {
        if (alive) {
          setPairs(p);
          setError("");
        }
      })
      .catch(() => {
        if (alive)
          setError(
            "The sketch archive could not be loaded. Saved images remain below.",
          );
      });
    return () => {
      alive = false;
    };
  }, [open, creations]);
  const known = new Set(pairs.flatMap((p) => p.images.map((i) => i.id)));
  const rows: Pair[] = [
    ...pairs,
    ...creations
      .filter((c) => !known.has(c.id))
      .map((c) => ({
        id: undefined,
        bundleId: c.id,
        sketch: c.sketch || "",
        spell: c.spell,
        sealed: true,
        created: c.created,
        day: new Date(c.created).toLocaleDateString("en-CA"),
        images: [c],
      })),
  ];
  const days = new Map<string, Map<string, Map<string, Pair[]>>>();
  for (const p of rows.sort((a, b) => (b.created || 0) - (a.created || 0))) {
    const day = p.day || "Earlier sketches — date unknown",
      sid = p.sessionId || "Earlier sketches — session unknown",
      bid = p.bundleId || `pair-${p.id}`;
    if (!days.has(day)) days.set(day, new Map());
    const sessions = days.get(day)!;
    if (!sessions.has(sid)) sessions.set(sid, new Map());
    const bundles = sessions.get(sid)!;
    if (!bundles.has(bid)) bundles.set(bid, []);
    bundles.get(bid)!.push(p);
  }
  return (
    <section
      className="collection archive-library"
      aria-label="Saved manifestations"
    >
      <p className="eyebrow">YOUR SPELLBOOK</p>
      <p role="status">{cloud}</p>
      <div className="archive-cloud-actions">
        <button type="button" onClick={() => void syncCloud()}>
          Back up now
        </button>
        <button
          type="button"
          disabled={busy || recovering}
          onClick={async () => {
            setRecovering(true);
            try {
              await restoreCloud();
              setPairs(await allPairs());
            } catch {
              /* status explains recovery failure */
            } finally {
              setRecovering(false);
            }
          }}
        >
          {recovering ? "Recovering…" : "Recover cloud spellbook"}
        </button>
      </div>
      {error && <p role="status">{error}</p>}
      {!rows.length && (
        <p>Your sketches and spells will appear here automatically.</p>
      )}
      {[...days].map(([day, sessions]) => (
        <section key={day}>
          <h3>{day}</h3>
          {[...sessions].map(([sid, bundles]) => {
            const first = [...bundles.values()][0][0];
            return (
              <section key={sid} aria-label="Spell session">
                <h4>
                  {first.sessionStarted
                    ? `Session · ${new Date(first.sessionStarted).toLocaleTimeString([], { hour: "numeric", minute: "2-digit" })}`
                    : sid}{" "}
                  · {bundles.size} {bundles.size === 1 ? "sketch" : "sketches"}
                </h4>
                {[...bundles].map(([bid, versions]) => (
                  <article key={bid} aria-label="Sketch bundle">
                    <div className="archive-source">
                      {versions[0].sketch && (
                        <img
                          src={versions[0].sketch}
                          alt="Sketch"
                          loading="lazy"
                        />
                      )}
                      <span>
                        Sketch{" "}
                        {Math.min(...versions.map((p) => p.id || 0)) || ""} ·{" "}
                        {versions.reduce((n, p) => n + p.images.length, 0)}{" "}
                        generations
                      </span>
                    </div>
                    <div className="collection-strip">
                      {versions.flatMap((p) =>
                        p.images.map((i) => (
                          <div className="archive-generation" key={i.id}>
                            <button
                              disabled={busy}
                              aria-label={"Open image: " + i.spell}
                              onClick={() =>
                                onOpen({
                                  id: i.id,
                                  image: i.image,
                                  spell: i.spell,
                                  created: i.created || p.created || 0,
                                  sketch: p.sketch,
                                })
                              }
                            >
                              <img src={i.image} alt="" loading="lazy" />
                              <span>{i.spell}</span>
                            </button>
                            <div className="archive-file-actions">
                              <button
                                aria-label={"Save image: " + i.spell}
                                onClick={() => {
                                  try {
                                    saveImage({
                                      id: i.id,
                                      image: i.image,
                                      spell: i.spell,
                                      created: i.created || 0,
                                    });
                                  } catch (e) {
                                    setError(
                                      e instanceof Error
                                        ? e.message
                                        : "Could not save image",
                                    );
                                  }
                                }}
                              >
                                Save
                              </button>
                              <button
                                aria-label={"Share image: " + i.spell}
                                onClick={() => {
                                  setError("");
                                  void shareImage({
                                    sketch: p.sketch,
                                    id: i.id,
                                    image: i.image,
                                    spell: i.spell,
                                    created: i.created || 0,
                                  }).catch((e) =>
                                    setError(
                                      e instanceof Error
                                        ? e.message
                                        : "Could not share image",
                                    ),
                                  );
                                }}
                              >
                                Share
                              </button>
                            </div>
                          </div>
                        )),
                      )}
                    </div>
                  </article>
                ))}
              </section>
            );
          })}
        </section>
      ))}
    </section>
  );
}
