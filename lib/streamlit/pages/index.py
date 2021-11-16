import os

import streamlit as st

from streamlit.server.server import Server

BASE_URL_PATH = st.get_option("server.baseUrlPath")

st.header("Index")

app_files = Server.get_current().get_app_files()
for file_path in app_files:
    path = os.path.join(BASE_URL_PATH, file_path)
    if path.startswith("/"):
        path = path[1:]
    st.markdown(
        f'<a href="/{path}" target="_self">{file_path}</a>',
        unsafe_allow_html=True,
    )
