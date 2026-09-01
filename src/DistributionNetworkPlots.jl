module DistributionNetworkPlots

using JSON3
using SHA

export render_case

const FRONTEND_DIR = normpath(joinpath(@__DIR__, "..", "frontend"))
const REPORT_APP_VERSION = "0.1.0-dev"
const REPORT_LAYOUT_ENGINE = "deterministic-svg-v1"

"""Escape text inserted into an HTML element or attribute."""
function _html_escape(value)
    replace(String(value),
        "&" => "&amp;",
        "<" => "&lt;",
        ">" => "&gt;",
        "\"" => "&quot;",
        "'" => "&#39;",
    )
end

"""Escape JSON before embedding it in a script element."""
function _safe_json(value)
    json = String(JSON3.write(value))
    replace(json,
        "<" => "\\u003c",
        ">" => "\\u003e",
        "&" => "\\u0026",
        "\u2028" => "\\u2028",
        "\u2029" => "\\u2029",
    )
end

"""Return stable metadata describing the embedded case, result, and renderer."""
function _report_metadata(case, result=nothing)
    json = String(JSON3.write(case))
    metadata = Dict(
        "case_fingerprint" => bytes2hex(sha256(json)),
        "case_fingerprint_algorithm" => "sha256-json3-v1",
        "schema" => get(case, "\$schema", nothing),
        "app_version" => REPORT_APP_VERSION,
        "layout_engine" => REPORT_LAYOUT_ENGINE,
    )
    if result !== nothing
        metadata["result_fingerprint"] = bytes2hex(sha256(String(JSON3.write(result))))
        metadata["result_fingerprint_algorithm"] = "sha256-json3-v1"
    end
    metadata
end

"""Return the browser explorer HTML with `case` embedded in the page.

The generated file is self-contained: it contains the initial explorer shell,
styles, JavaScript, and the serialised case. No application server is needed.
The tile-free renderer also works when the file is opened directly from disk.
"""
function render_case(case::AbstractDict, output::AbstractString; title::AbstractString="BMOPF case", result=nothing)
    template = read(joinpath(FRONTEND_DIR, "index.html"), String)
    examples = read(joinpath(FRONTEND_DIR, "examples.js"), String)
    model = read(joinpath(FRONTEND_DIR, "model.js"), String)
    app = read(joinpath(FRONTEND_DIR, "app.js"), String)
    css = read(joinpath(FRONTEND_DIR, "styles.css"), String)
    embedded = _safe_json(case)
    report_metadata = _safe_json(_report_metadata(case, result))
    html_title = _html_escape(title)
    result_script = result === nothing ? "" : " globalThis.__BMOPF_RESULT__ = $(_safe_json(result));"

    html = replace(template,
        "<title>BMOPF Explorer</title>" => "<title>$(html_title)</title>",
        "<link rel=\"stylesheet\" href=\"styles.css\">" => "<style>$(css)</style>",
        "<script src=\"examples.js\"></script>" => "<script>$(examples)</script>",
        "<script src=\"model.js\"></script>" => "<script>$(model)</script>",
        "<script src=\"app.js\"></script>" => "<script>globalThis.__BMOPF_REPORT_META__ = $(report_metadata); globalThis.__BMOPF_CASE__ = $(embedded);$(result_script)</script><script>$(app)</script>",
    )

    mkpath(dirname(abspath(output)))
    write(output, html)
    return output
end

"""Read a BMOPF JSON file and produce a self-contained explorer report."""
function render_case(input::AbstractString, output::AbstractString; title::AbstractString=basename(input), result=nothing)
    document = JSON3.read(read(input, String), Dict{String,Any})
    render_case(document, output; title, result)
end

end
