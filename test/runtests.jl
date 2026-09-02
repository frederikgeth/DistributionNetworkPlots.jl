using Test
using JSON3
using DistributionNetworkPlots

const FIXTURE = joinpath(@__DIR__, "..", "fixtures", "micro", "micro_bmopf.json")
const RESULT_FIXTURE = joinpath(@__DIR__, "..", "fixtures", "micro", "micro_bmopf_result.json")
const COMPARISON_RESULT_FIXTURE = joinpath(@__DIR__, "..", "fixtures", "micro", "micro_bmopf_result_comparison.json")
const MULTINETWORK_RESULT_FIXTURE = joinpath(@__DIR__, "..", "fixtures", "micro", "micro_bmopf_multinetwork_result.json")

@testset "self-contained report" begin
    case = JSON3.read(read(FIXTURE, String), Dict{String,Any})
    result = JSON3.read(read(RESULT_FIXTURE, String), Dict{String,Any})
    output = joinpath(mktempdir(), "micro.html")
    render_case(case, output; title="Micro BMOPF", result)
    html = read(output, String)
    @test occursin("<title>Micro BMOPF</title>", html)
    @test occursin("globalThis.__BMOPF_CASE__", html)
    @test occursin("micro-bmopf", html)
    @test occursin("BMOPFModel", html)
    @test occursin("BMOPFExamples", html)
    @test occursin("__BMOPF_REPORT_META__", html)
    @test occursin("case_fingerprint", html)
    @test occursin("case_fingerprint_algorithm", html)
    @test occursin("result_fingerprint", html)
    @test occursin("__BMOPF_RESULT__", html)
    @test occursin("__BMOPF_ELK_BUNDLE_SOURCE__", html)
    @test occursin("org.eclipse.elk.processingOrder.preferredRoot", html)
    @test occursin("routeMidpoint", html)
    @test occursin("renderer-contract-v1", html)
    @test occursin("BMOPFRendererContract", html)
    @test occursin("symbols-renderer-v1", html)
    @test occursin("BMOPFRenderers", html)
    @test occursin("multi-wire-projection-v1", html)
    @test occursin("BMOPFProjections", html)
    @test occursin("deterministic-layout-v1", html)
    @test occursin("BMOPFLayouts", html)
    @test occursin("terminal detail", html)
    @test occursin("Open switch: conductor paths are intentionally interrupted", html)
    @test occursin("winding detail", html)
    @test occursin("Each winding keeps its bus and terminal stack", html)
    @test occursin("LAYOUT_CACHE_VERSION = 3", html)
    @test occursin("bmopf-layout-v3:", html)
    @test occursin("LAYOUT_MAX_PROFILES = 8", html)
    @test occursin("pruneLayoutProfiles", html)
    @test occursin("single-svg-v1", html)
    @test occursin("Eclipse Public License", read(joinpath(@__DIR__, "..", "frontend", "vendor", "ELK-LICENSE.md"), String))
    @test !occursin("href=\"styles.css\"", html)
    @test !occursin("src=\"examples.js\"", html)
    @test !occursin("src=\"renderer-contract.js\"", html)
    @test !occursin("src=\"renderers/symbols.js\"", html)
    @test !occursin("src=\"projections/multi-wire.js\"", html)
    @test !occursin("src=\"layout/deterministic.js\"", html)
    @test !occursin("src=\"app.js\"", html)
end

@testset "safe report title" begin
    case = Dict("name" => "title-case", "bus" => Dict{String,Any}())
    output = joinpath(mktempdir(), "title.html")
    render_case(case, output; title="</title><script>alert(1)</script>")
    html = read(output, String)
    @test !occursin("</title><script>alert(1)", html)
    @test occursin("&lt;/title&gt;&lt;script&gt;", html)
end

@testset "safe embedding" begin
    case = Dict("name" => "</script><script>alert(1)</script>", "bus" => Dict{String,Any}())
    output = joinpath(mktempdir(), "unsafe.html")
    render_case(case, output)
    html = read(output, String)
    @test !occursin("</script><script>alert(1)", html)
    @test occursin("\\u003c/script\\u003e", html)
end

@testset "fixture provenance" begin
    case = JSON3.read(read(FIXTURE, String), Dict{String,Any})
    @test case["meta"]["license"] == "CC-BY-4.0"
    @test case["meta"]["attribution"] == "DistributionNetworkPlots.jl contributors"
    @test case["meta"]["source"] == "authored in this repository"
    @test haskey(case["transformer"]["n_winding"], "tx_three")
    @test length(case["transformer"]["n_winding"]["tx_three"]["windings"]) == 3
    @test case["line"]["line_main"]["line_geometry"] == "route_main"
    @test length(case["line_geometry"]["route_main"]["coordinates"]) == 3
    result = JSON3.read(read(RESULT_FIXTURE, String), Dict{String,Any})
    @test result["meta"]["license"] == "CC-BY-4.0"
    @test result["meta"]["case_id"] == "micro-bmopf"
    @test result["meta"]["case_fingerprint_algorithm"] == "sha256-json3-v1"
    @test result["termination_status"] == "LOCALLY_SOLVED"
    @test result["line"]["line_main"]["loading"] == 0.42
    @test result["bus"]["load_bus"]["voltage_deviation"] == 0.062
    @test length(result["solution_profile"]["bound_violations"]) == 1
    @test result["solution_profile"]["bound_violations"][1]["id"] == "line_main"
    comparison = JSON3.read(read(COMPARISON_RESULT_FIXTURE, String), Dict{String,Any})
    @test comparison["objective"] == 11890.2
    @test comparison["meta"]["case_fingerprint"] == result["meta"]["case_fingerprint"]
    @test comparison["line"]["line_main"]["loading"] == 0.78
    multinetwork = JSON3.read(read(MULTINETWORK_RESULT_FIXTURE, String), Dict{String,Any})
    @test length(multinetwork["nw"]) == 2
    @test multinetwork["nw"]["snapshot_01"]["line"]["line_main"]["loading"] == 0.78
end
