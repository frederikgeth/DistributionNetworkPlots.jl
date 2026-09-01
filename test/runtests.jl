using Test
using JSON3
using DistributionNetworkPlots

const FIXTURE = joinpath(@__DIR__, "..", "fixtures", "micro", "micro_bmopf.json")

@testset "self-contained report" begin
    case = JSON3.read(read(FIXTURE, String), Dict{String,Any})
    output = joinpath(mktempdir(), "micro.html")
    render_case(case, output; title="Micro BMOPF")
    html = read(output, String)
    @test occursin("<title>Micro BMOPF</title>", html)
    @test occursin("globalThis.__BMOPF_CASE__", html)
    @test occursin("micro-bmopf", html)
    @test occursin("BMOPFModel", html)
    @test occursin("__BMOPF_REPORT_META__", html)
    @test occursin("case_fingerprint", html)
    @test !occursin("href=\"styles.css\"", html)
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
end
