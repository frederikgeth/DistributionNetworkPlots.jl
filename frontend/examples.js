(function () {
  "use strict";

  const complete = {
    "$schema": "https://raw.githubusercontent.com/frederikgeth/bmopf-report/main/schema/bmopf.json",
    name: "example-complete-feeder",
    base_frequency: 50,
    meta: { license: "CC-BY-4.0", attribution: "DistributionNetworkPlots.jl contributors", source: "authored in this repository", case_study_generator: "built-in browser example" },
    bus: {
      source: { terminal_names: ["1", "2", "3", "n"], perfectly_grounded_terminals: ["n"], longitude: 152.920, latitude: -27.590 },
      feeder: { terminal_names: ["1", "2", "3", "n"], perfectly_grounded_terminals: ["n"], longitude: 153.060, latitude: -27.510 },
      load_bus: { terminal_names: ["1", "2", "3", "n"], perfectly_grounded_terminals: ["n"], longitude: 153.190, latitude: -27.410 },
      aux_bus: { terminal_names: ["1", "2", "3", "n"], perfectly_grounded_terminals: ["n"], longitude: 153.320, latitude: -27.320 }
    },
    voltage_source: { grid_source: { bus: "source", terminal_map: ["1", "2", "3", "n"], v_magnitude: [6350, 6350, 6350, 0] } },
    line: { line_main: { bus_from: "source", bus_to: "feeder", terminal_map_from: ["1", "2", "3", "n"], terminal_map_to: ["1", "2", "3", "n"], linecode: "lc_main", line_geometry: "route_main", length: 120 } },
    switch: { switch_open: { bus_from: "feeder", bus_to: "load_bus", terminal_map_from: ["1", "2", "3", "n"], terminal_map_to: ["1", "3", "2", "n"], open_switch: true } },
    line_geometry: { route_main: { coordinates: [[152.920, -27.590], [152.980, -27.550], [153.060, -27.510]] } },
    transformer: {
      two_winding: { tx_lv: { bus_from: "feeder", bus_to: "load_bus", terminal_map_from: ["1", "2", "3"], terminal_map_to: ["1", "2", "3", "n"], s_rating: 100000, v_nom_from: 11000, v_nom_to: 433 } },
      n_winding: { tx_three: { windings: [{ bus: "feeder", terminal_map: ["1", "2", "3"], v_nom: 11000, configuration: "WYE" }, { bus: "load_bus", terminal_map: ["1", "2", "3", "n"], v_nom: 433, configuration: "WYE" }, { bus: "aux_bus", terminal_map: ["1", "2", "3"], v_nom: 433, configuration: "DELTA" }], s_rating: 150000 } }
    },
    load: { load_a: { bus: "load_bus", terminal_map: ["1", "n"], configuration: "SINGLE_PHASE", p_nom: [12000], q_nom: [2500] } },
    generator: { backup_gen: { bus: "feeder", terminal_map: ["1", "2", "3"], p_min: [0], p_max: [50000] } },
    ibr: { rooftop_ibr: { bus: "load_bus", terminal_map: ["2", "n"], p_max: [30000], q_max: [10000] } },
    shunt: { grounding: { bus: "feeder", terminal_map: ["n"], G_1_1: 0.1 } },
    capacitor: { cap_bank: { bus: "load_bus", terminal_map: ["1", "2", "3"], q_nom: [5000, 5000, 5000] } },
    linecode: { lc_main: { i_max: [300, 300, 300, 300] } }
  };

  const partial = {
    name: "example-sparse-dc-and-diagnostics",
    meta: { license: "CC-BY-4.0", attribution: "DistributionNetworkPlots.jl contributors", source: "authored in this repository", case_study_generator: "built-in browser example" },
    bus: {
      substation: { terminal_names: ["1", "2", "3", "n"], perfectly_grounded_terminals: ["n"], longitude: 152.800, latitude: -27.650 },
      branch: { terminal_names: ["1", "2", "3", "n"], longitude: 153.050, latitude: -27.500 },
      remote: { terminal_names: ["p", "n"], longitude: 153.300, latitude: -27.350 },
      unmapped: { terminal_names: ["1", "2", "3", "n"] }
    },
    voltage_source: { source: { bus: "substation", terminal_map: ["1", "2", "3", "n"] } },
    line: { phase_mismatch: { bus_from: "substation", bus_to: "branch", terminal_map_from: ["1", "2", "3", "n"], terminal_map_to: ["1", "2", "3"], status: "in_service" } },
    switch: { sectionaliser: { bus_from: "branch", bus_to: "remote", terminal_map_from: ["1", "2"], terminal_map_to: ["p", "n"], open_switch: false } },
    load: { remote_load: { bus: "remote", terminal_map: ["p", "n"], p_nom: [4000], q_nom: [800] } },
    dc_bus: { dc_link: { terminal_names: ["p", "n"] } },
    dc_branch: { dc_tie: { bus_from: "dc_link", bus_to: "remote", terminal_map_from: ["p", "n"], terminal_map_to: ["p", "n"] } },
    dc_load: { dc_load: { bus: "dc_link", terminal_map: ["p", "n"], p_nom: [1500] } },
    dc_source: { dc_source: { bus: "dc_link", terminal_map: ["p", "n"], p_max: [2500] } },
    dc_grounding: { dc_ground: { bus: "dc_link", terminal_map: ["n"] } },
    custom_annotation: { note: "Unknown records remain available in the inspector." }
  };

  globalThis.BMOPFExamples = [
    { id: "complete", label: "Complete feeder (all AC models)", description: "Coordinates, line geometry, open switch, two- and three-winding transformer, and all supported AC devices.", case: complete },
    { id: "partial", label: "Sparse + DC diagnostics", description: "Missing coordinates, terminal mismatch, and raw-only DC records for support-boundary testing.", case: partial }
  ];
})();
