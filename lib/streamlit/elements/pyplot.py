# Copyright 2018-2022 Streamlit Inc.
#
# Licensed under the Apache License, Version 2.0 (the "License");
# you may not use this file except in compliance with the License.
# You may obtain a copy of the License at
#
#    http://www.apache.org/licenses/LICENSE-2.0
#
# Unless required by applicable law or agreed to in writing, software
# distributed under the License is distributed on an "AS IS" BASIS,
# WITHOUT WARRANTIES OR CONDITIONS OF ANY KIND, either express or implied.
# See the License for the specific language governing permissions and
# limitations under the License.

"""Streamlit support for Matplotlib PyPlot charts."""

import io
import pprint
import random
from typing import cast
import hashlib
import string

import streamlit
import streamlit.elements.image as image_utils
from streamlit import config
from streamlit.errors import StreamlitDeprecationWarning
from streamlit.logger import get_logger
from streamlit.proto.Image_pb2 import ImageList as ImageListProto
from streamlit.proto.Pyplot_pb2 import Pyplot as PyplotProto
from streamlit.proto.IFrame_pb2 import IFrame as IFrameProto
from streamlit.elements.iframe import marshall
from streamlit.proto.Alert_pb2 import Alert as AlertProto
from .utils import clean_text

LOGGER = get_logger(__name__)


class PyplotMixin:
    def pyplot(self, fig=None, clear_figure=None, interactive=True, points=None, **kwargs):
        """Display a matplotlib.pyplot figure.

        Parameters
        ----------
        fig : Matplotlib Figure
            The figure to plot. When this argument isn't specified, this
            function will render the global figure (but this is deprecated,
            as described below)

        clear_figure : bool
            If True, the figure will be cleared after being rendered.
            If False, the figure will not be cleared after being rendered.
            If left unspecified, we pick a default based on the value of `fig`.

            * If `fig` is set, defaults to `False`.

            * If `fig` is not set, defaults to `True`. This simulates Jupyter's
              approach to matplotlib rendering.

        **kwargs : any
            Arguments to pass to Matplotlib's savefig function.

        Example
        -------
        >>> import matplotlib.pyplot as plt
        >>> import numpy as np
        >>>
        >>> arr = np.random.normal(1, 1, size=100)
        >>> fig, ax = plt.subplots()
        >>> ax.hist(arr, bins=20)
        >>>
        >>> st.pyplot(fig)

        .. output::
           https://share.streamlit.io/streamlit/docs/main/python/api-examples-source/charts.pyplot.py
           height: 630px

        Notes
        -----
        .. note::
           Deprecation warning. After December 1st, 2020, we will remove the ability
           to specify no arguments in `st.pyplot()`, as that requires the use of
           Matplotlib's global figure object, which is not thread-safe. So
           please always pass a figure object as shown in the example section
           above.

        Matplotlib support several different types of "backends". If you're
        getting an error using Matplotlib with Streamlit, try setting your
        backend to "TkAgg"::

            echo "backend: TkAgg" >> ~/.matplotlib/matplotlibrc

        For more information, see https://matplotlib.org/faq/usage_faq.html.

        """

        if not fig and config.get_option("deprecation.showPyplotGlobalUse"):
            self.dg.exception(PyplotGlobalUseWarning())
        if not interactive:
            image_list_proto = ImageListProto()
            marshall_image(
                self.dg._get_delta_path_str(), image_list_proto, fig, clear_figure, interactive, **kwargs
            )
            try:
                import matplotlib
                import matplotlib.pyplot as plt

                plt.ioff()
            except ImportError:
                raise ImportError("pyplot() command requires matplotlib")
            return self.dg._enqueue("imgs", image_list_proto)

        else: 
            try:
                import json
                import matplotlib
                import matplotlib.pyplot as plt, mpld3
                from mpld3 import plugins
                
            except ImportError:
                raise ImportError("pyplot() command requires matplotlib")
#             print(f"FIX AXES: {fig.axes}")

#             if not fig:
#                 if clear_figure is None:
#                     clear_figure = True

#                 fig = plt
#             for axes in fig.axes:
#                 for line in axes.get_lines():
#                     xy_data = line.get_xydata()
#                     # print(f"TYPE OF XY_DATA: {type(xy_data)}")
#                     # print(f"LINE: {xy_data}")
#                     css = """
# table
# {
#   border-collapse: collapse;
# }
# th
# {
#   color: #ffffff;
#   background-color: #000000;
# }
# td
# {
#   background-color: #cccccc;
# }
# table, th, td
# {
#   font-family:Arial, Helvetica, sans-serif;
#   border: 1px solid black;
#   text-align: right;
# }
# """
#                     labels = []
#                     print(f"LEN OF XY_DATA: {len(xy_data)}")
#                     for i in range(len(xy_data)):
#                         print(f'<table border="1" class="dataframe"> <thead> <tr style="text-align: right;"> <th></th> <th>Point {i}</th> </tr> </thead> <tbody> <tr> <th>x</th> <td>{xy_data[i][0]}</td> </tr> <tr> <th>y</th> <td>{xy_data[i][1]}</td> </tr> </tbody> </table>')
#                         labels.append(f'<table border="1" class="dataframe"> <thead> <tr style="text-align: right;"> <th></th> <th>Point {i}</th> </tr> </thead> <tbody> <tr> <th>x</th> <td>{xy_data[i][0]}</td> </tr> <tr> <th>y</th> <td>{xy_data[i][1]}</td> </tr> </tbody> </table>')
#                     # print(f"LABELS: {labels}")
#                     tooltip = plugins.PointHTMLTooltip(points=line, labels=labels, css=css)
#             # label = '<h1>Line {}</h1>'.format('A')
#             # tooltip = plugins.connect(fig, plugins.LineHTMLTooltip(fig.axes[0].get_lines()[0], label))
#                     plugins.connect(fig, tooltip)
#             # print(f"LEN OF LABELS: {len(labels)}")

            # TODO: Figure out how to size the image with dpi but for now make it 200
            if fig.dpi < 200:
                fig.dpi = 200
            h = hashlib.new("md5")
            
            # print(f"TYPE OF FIG: {type(fig)}")
            # print(fig._localaxes)
            # css = """
            #     table
            #     {
            #     border-collapse: collapse;
            #     }
            #     th
            #     {
            #     color: #ffffff;
            #     background-color: #000000;
            #     }
            #     td
            #     {
            #     background-color: #cccccc;
            #     }
            #     table, th, td
            #     {
            #     font-family:Arial, Helvetica, sans-serif;
            #     border: 1px solid black;
            #     text-align: right;
            #     }
            #     """
            for axes in fig.axes:
                for line in axes.get_lines():
                    # linestyle = line.get_linestyle()
                    # # '.' linestyle does not work with line tooltip for some reason.
                    # if linestyle == '-' or linestyle == '--' or linestyle=='-.':
                    #     label = '<h1>line {title}</h1>'.format(title='A')
                    #     tooltip = plugins.LineHTMLTooltip(line, label)
                    #     # tooltip = plugins.LineLabelTooltip(line)
                    #     print(f"THIS AXES({axes}) MAPS TO {linestyle})")
                    # else:
                    xy_data = line.get_xydata()
                        # print(f"TYPE OF XY_DATA: {type(xy_data)}")
                        # print(f"LINE: {xy_data}")
                        # print(f"LEN OF XYDATA: {len(xy_data)}")
                
                    labels=[]
                        # print(f"LEN OF XYDATA {len(xy_data)}")
                    for i in range(len(xy_data)):
                        label = xy_data[i]
                        #this should move to the frontend
                        label_string = f'<table border="1" class="dataframe"> <thead> <tr style="text-align: right;"> <th></th> <th>Row {i}</th> </tr> </thead> <tbody> <tr> <th>x</th> <td>{label[0]}</td> </tr> <tr> <th>y</th> <td>{label[1]}</td> </tr> </tbody> </table>'
                        labels.append(label_string)
                            # print(labels)
                            # .to_html() is unicode; so make leading 'u' go away with str()
                            # labels.append(label_string)
                    tooltip = plugins.PointHTMLTooltip(points=line, labels=labels)
                    plugins.connect(fig, tooltip) 
            # html_string = mpld3.fig_to_dict(fig)
            # print(pprint.pformat(html_string))
            # print(fig.axes[0])
            # print(html_string)
            # iframe_proto = IFrameProto()
            # width, height = fig.get_size_inches() * fig.dpi
            # marshall(iframe_proto, srcdoc=html_string, height=height +10, width=width)
            # return self.dg._enqueue("iframe", iframe_proto)
            fig_json = mpld3.fig_to_dict(fig)
            try:
                json_dump = json.dumps(fig_json)
            except TypeError as e:
                alert_proto = AlertProto()
                alert_proto.body = clean_text("Looks like you're trying to render an interactive 3d pyplot! We do not support that at this time because of https://github.com/mpld3/mpld3/issues/223. Try using the interactive=false mode!")
                alert_proto.format = AlertProto.ERROR
                return self.dg._enqueue("alert", alert_proto)
            
            encoded = json_dump.encode()
            h.update(encoded)
            
            width, _ = fig.get_size_inches() * fig.dpi
            
            pyplot_proto = PyplotProto()
            pyplot_proto.json = json_dump
            pyplot_proto.width = width
            pyplot_proto.id = "fig" + h.hexdigest() 
            print(f"ID: {pyplot_proto.id}")
            
            return self.dg._enqueue("pyplot", pyplot_proto)

    @property
    def dg(self) -> "streamlit.delta_generator.DeltaGenerator":
        """Get our DeltaGenerator."""
        return cast("streamlit.delta_generator.DeltaGenerator", self)


def marshall_image(coordinates, image_list_proto, fig=None, clear_figure=True, interactive=False, **kwargs):
    try:
        import matplotlib
        import matplotlib.pyplot as plt

        plt.ioff()
    except ImportError:
        raise ImportError("pyplot() command requires matplotlib")
    
    # You can call .savefig() on a Figure object or directly on the pyplot
    # module, in which case you're doing it to the latest Figure.
    if not fig:
        if clear_figure is None:
            clear_figure = True

        fig = plt

    # Normally, dpi is set to 'figure', and the figure's dpi is set to 100.
    # So here we pick double of that to make things look good in a high
    # DPI display.
    options = {"bbox_inches": "tight", "dpi": 200, "format": "png"}

    # If some of the options are passed in from kwargs then replace
    # the values in options with the ones from kwargs
    options = {a: kwargs.get(a, b) for a, b in options.items()}
    # Merge options back into kwargs.
    kwargs.update(options)

    image = io.BytesIO()
    fig.savefig(image, **kwargs)
    image_utils.marshall_images(
        coordinates,
        image,
        None,
        -2,
        image_list_proto,
        False,
        channels="RGB",
        output_format="PNG",
    )

    # Clear the figure after rendering it. This means that subsequent
    # plt calls will be starting fresh.
    if clear_figure:
        fig.clf()


class PyplotGlobalUseWarning(StreamlitDeprecationWarning):
    def __init__(self):
        super(PyplotGlobalUseWarning, self).__init__(
            msg=self._get_message(), config_option="deprecation.showPyplotGlobalUse"
        )

    def _get_message(self):
        return """
You are calling `st.pyplot()` without any arguments. After December 1st, 2020,
we will remove the ability to do this as it requires the use of Matplotlib's global
figure object, which is not thread-safe.

To future-proof this code, you should pass in a figure as shown below:

```python
>>> fig, ax = plt.subplots()
>>> ax.scatter([1, 2, 3], [1, 2, 3])
>>>    ... other plotting actions ...
>>> st.pyplot(fig)
```
"""
