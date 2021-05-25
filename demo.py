import altair as alt
import numpy as np
import pandas as pd

import streamlit as st

st.set_page_config(layout="wide")

"# Apache Arrow Integration"
"A long time ago in a galaxy far, far away...."
st.audio("https://bit.ly/2RISO0b")

"### Table"
df = pd.DataFrame(np.random.randn(10, 5), columns=("col %d" % i for i in range(5)))
c1, c2 = st.beta_columns(2)
c1.table(df)
c2.beta_table(df)

"### DataFrame"
df = pd.DataFrame(np.random.randn(50, 20), columns=("col %d" % i for i in range(20)))
c1, c2 = st.beta_columns(2)
c1.dataframe(df)
c2.beta_dataframe(df)

"### Styler"
df = pd.DataFrame(np.random.randn(50, 20), columns=("col %d" % i for i in range(20)))
c1, c2 = st.beta_columns(2)
c1.dataframe(df.style.highlight_max(axis=0))
c2.beta_dataframe(df.style.highlight_max(axis=0))

"### Add rows"
df1 = pd.DataFrame(np.random.randn(50, 20), columns=("col %d" % i for i in range(20)))
df2 = pd.DataFrame(np.random.randn(50, 20), columns=("col %d" % i for i in range(20)))
c1, c2 = st.beta_columns(2)
e1 = c1.dataframe(df1)
e1.add_rows(df2)
e2 = c2.beta_dataframe(df1)
e2.beta_add_rows(df2)

"### Line chart"
chart_data = pd.DataFrame(np.random.randn(20, 3), columns=["a", "b", "c"])
c1, c2 = st.beta_columns(2)
c1.line_chart(chart_data)
c2.beta_line_chart(chart_data)

"### Area chart"
chart_data = pd.DataFrame(np.random.randn(20, 3), columns=["a", "b", "c"])
c1, c2 = st.beta_columns(2)
c1.area_chart(chart_data)
c2.beta_area_chart(chart_data)

"### Bar chart"
chart_data = pd.DataFrame(np.random.randn(50, 3), columns=["a", "b", "c"])
c1, c2 = st.beta_columns(2)
c1.bar_chart(chart_data)
c2.beta_bar_chart(chart_data)

"### Altair chart"
df = pd.DataFrame(np.random.randn(200, 3), columns=["a", "b", "c"])
c = (
    alt.Chart(df)
    .mark_circle()
    .encode(x="a", y="b", size="c", color="c", tooltip=["a", "b", "c"])
)
c1, c2 = st.beta_columns(2)
c1.altair_chart(c, use_container_width=True)
c2.beta_altair_chart(c, use_container_width=True)

"### Vega-Lite chart"
df = pd.DataFrame(np.random.randn(200, 3), columns=["a", "b", "c"])
c1, c2 = st.beta_columns(2)
c1.vega_lite_chart(
    df,
    {
        "mark": {"type": "circle", "tooltip": True},
        "encoding": {
            "x": {"field": "a", "type": "quantitative"},
            "y": {"field": "b", "type": "quantitative"},
            "size": {"field": "c", "type": "quantitative"},
            "color": {"field": "c", "type": "quantitative"},
        },
    },
    use_container_width=True,
)
c2.beta_vega_lite_chart(
    df,
    {
        "mark": {"type": "circle", "tooltip": True},
        "encoding": {
            "x": {"field": "a", "type": "quantitative"},
            "y": {"field": "b", "type": "quantitative"},
            "size": {"field": "c", "type": "quantitative"},
            "color": {"field": "c", "type": "quantitative"},
        },
    },
    use_container_width=True,
)

"### Vega-Lite chart (with Named Datasets)"
df = pd.DataFrame(np.random.randn(200, 3), columns=["a", "b", "c"])
c1, c2 = st.beta_columns(2)
c1.vega_lite_chart(
    {
        "datasets": {"foo": df},
        "data": {"name": "foo"},
        "mark": {"type": "circle", "tooltip": True},
        "encoding": {
            "x": {"field": "a", "type": "quantitative"},
            "y": {"field": "b", "type": "quantitative"},
            "size": {"field": "c", "type": "quantitative"},
            "color": {"field": "c", "type": "quantitative"},
        },
    },
    use_container_width=True,
)
c2.beta_vega_lite_chart(
    {
        "datasets": {"foo": df},
        "data": {"name": "foo"},
        "mark": {"type": "circle", "tooltip": True},
        "encoding": {
            "x": {"field": "a", "type": "quantitative"},
            "y": {"field": "b", "type": "quantitative"},
            "size": {"field": "c", "type": "quantitative"},
            "color": {"field": "c", "type": "quantitative"},
        },
    },
    use_container_width=True,
)

"### Notice anything different?"
"That's right. You shouldn't have!"
