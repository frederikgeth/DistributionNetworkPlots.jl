module DistributionNetworkPlots

using JSON3

export render_case

const FRONTEND_DIR = normpath(joinpath(@__DIR__, "..", "frontend"))

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

"""Return the browser explorer HTML with `case` embedded in the page.

The generated file is self-contained: it contains the initial explorer shell,
styles, JavaScript, and the serialised case. No application server is needed.
The tile-free renderer also works when the file is opened directly from disk.
"""
function render_case(case::AbstractDict, output::AbstractString; title::AbstractString="BMOPF case")
    template = read(joinpath(FRONTEND_DIR, "index.html"), String)
    model = read(joinpath(FRONTEND_DIR, "model.js"), String)
    app = read(joinpath(FRONTEND_DIR, "app.js"), String)
    css = read(joinpath(FRONTEND_DIR, "styles.css"), String)
    embedded = _safe_json(case)

    html = replace(template,
        "<title>BMOPF Explorer</title>" => "<title>$(title)</title>",
        "<link rel=\"stylesheet\" href=\"styles.css\">" => "<style>$(css)</style>",
        "<script src=\"model.js\"></script>" => "<script>$(model)</script>",
        "<script src=\"app.js\"></script>" => "<script>globalThis.__BMOPF_CASE__ = $(embedded);</script><script>$(app)</script>",
    )

    mkpath(dirname(abspath(output)))
    write(output, html)
    return output
end

"""Read a BMOPF JSON file and produce a self-contained explorer report."""
function render_case(input::AbstractString, output::AbstractString; title::AbstractString=basename(input))
    document = JSON3.read(read(input, String), Dict{String,Any})
    render_case(document, output; title)
end

end
