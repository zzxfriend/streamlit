/**
 * @license
 * Copyright 2018-2022 Streamlit Inc.
 *
 * Licensed under the Apache License, Version 2.0 (the "License");
 * you may not use this file except in compliance with the License.
 * You may obtain a copy of the License at
 *
 *    http://www.apache.org/licenses/LICENSE-2.0
 *
 * Unless required by applicable law or agreed to in writing, software
 * distributed under the License is distributed on an "AS IS" BASIS,
 * WITHOUT WARRANTIES OR CONDITIONS OF ANY KIND, either express or implied.
 * See the License for the specific language governing permissions and
 * limitations under the License.
 */


 import React, { ReactElement, useEffect, useRef } from 'react'
 import {
    Pyplot as PyplotProto
} from "src/autogen/proto"

export interface PyplotProps {
    element: PyplotProto
    width: number
}
 
export default function Pyplot(props: PyplotProps): ReactElement {
    const { element } = props
    const { id, json } = element
    const parsedJson = JSON.parse(json)
    const elementRef = useRef<HTMLDivElement>(null);
    console.log(parsedJson)
    // eslint-disable-next-line @typescript-eslint/no-var-requires
    const d3 = require('d3')
    console.log(d3)
    // mpld3.draw_figure(id, parsedJson)
        // eslint-disable-next-line @typescript-eslint/no-var-requires
        const mpld3 = require('mpld3')
        // eslint-disable-next-line @typescript-eslint/ban-ts-comment
        // @ts-ignore
        mpld3.register_plugin("htmltooltip", HtmlTooltipPlugin);
        // eslint-disable-next-line @typescript-eslint/ban-ts-comment
        // @ts-ignore
        HtmlTooltipPlugin.prototype = Object.create(mpld3.Plugin.prototype);
        HtmlTooltipPlugin.prototype.constructor = HtmlTooltipPlugin;
        HtmlTooltipPlugin.prototype.requiredProps = ["id"];
        HtmlTooltipPlugin.prototype.defaultProps = {labels:null,
                                                    target:null,
                                                    hoffset:0,
                                                    voffset:10,
                                                    targets:null}
        // eslint-disable-next-line @typescript-eslint/ban-ts-comment
        // @ts-ignore
        function HtmlTooltipPlugin(fig, props){
            // eslint-disable-next-line @typescript-eslint/ban-ts-comment
            // @ts-ignore
            mpld3.Plugin.call(this, fig, props);
        }
        HtmlTooltipPlugin.prototype.draw = function(){
            // eslint-disable-next-line @typescript-eslint/ban-ts-comment
            // @ts-ignore
            const obj = mpld3.get_element(this.props.id)
            const labels = this.props.labels
            const targets = this.props.targets
            // eslint-disable-next-line @typescript-eslint/ban-ts-comment
            // @ts-ignore
            const tooltip = d3.select("body").append("div")
                .attr("class", "mpld3-tooltip")
                .style("position", "absolute")
                .style("z-index", "10")
                .style("visibility", "hidden")
            if (obj !== null){
                obj.elements()
                // eslint-disable-next-line @typescript-eslint/ban-ts-comment
                // @ts-ignore
                .on("mouseover", function(d, index){
                    tooltip.html(labels[index])
                        .style("visibility", "visible");
                })
                // eslint-disable-next-line @typescript-eslint/ban-ts-comment
                // @ts-ignore
                // eslint-disable-next-line @typescript-eslint/no-unused-vars
                .on("mousemove", function(d, i){
                    // console.log(d3)
                    // console.log(event)
                    // // console.log(event.target)
                    // console.log(window.event)
                    tooltip
                    // eslint-disable-next-line @typescript-eslint/ban-ts-comment
                    // @ts-ignore
                    // Not sure if we want to use this event since it's deprecated...
                    .style("top", event.pageY + this.props.voffset + "px")
                    // eslint-disable-next-line @typescript-eslint/ban-ts-comment
                    // @ts-ignore
                    // Not sure if we want to use this event since it's deprecated...
                    .style("left", event.pageX + this.props.hoffset + "px");
                }.bind(this))
                // eslint-disable-next-line @typescript-eslint/ban-ts-comment
                // @ts-ignore
                .on("mousedown.callout", function(d, i){
                    if (targets !== null) {
                        window.open(targets[i],"_blank");
                    }
                })
                // eslint-disable-next-line @typescript-eslint/ban-ts-comment
                // @ts-ignore
                // eslint-disable-next-line @typescript-eslint/no-unused-vars
                .on("mouseout", function(d, i){
                    tooltip.style("visibility", "hidden");
                })
            }
        }
        mpld3.register_plugin("linehtmltooltip", LineHTMLTooltip)
        LineHTMLTooltip.prototype = Object.create(mpld3.Plugin.prototype)
        LineHTMLTooltip.prototype.constructor = LineHTMLTooltip
        LineHTMLTooltip.prototype.requiredProps = ["id"]
        LineHTMLTooltip.prototype.defaultProps = {labels:null,
            target:null,
            hoffset:0,
            voffset:10,
            targets:null}
        // eslint-disable-next-line @typescript-eslint/ban-ts-comment
        // @ts-ignore                                        
        function LineHTMLTooltip(fig, props){
            // eslint-disable-next-line @typescript-eslint/ban-ts-comment
            // @ts-ignore
            mpld3.Plugin.call(this, fig, props)
        }
        LineHTMLTooltip.prototype.draw = function(){
            // eslint-disable-next-line @typescript-eslint/ban-ts-comment
            // @ts-ignore
            const obj = mpld3.get_element(this.props.id, this.fig)
            // eslint-disable-next-line @typescript-eslint/ban-ts-comment
            // @ts-ignore
            const label = this.props.label
            // eslint-disable-next-line @typescript-eslint/ban-ts-comment
            // @ts-ignore
            const tooltip = d3.select("body").append("div")
                        .attr("class", "mpld3-tooltip")
                        .style("position", "absolute")
                        .style("z-index", "10")
                        .style("visibility", "hidden");
            obj.elements()
            // eslint-disable-next-line @typescript-eslint/ban-ts-comment
            // @ts-ignore
            // eslint-disable-next-line @typescript-eslint/no-unused-vars
            .on("mouseover", function(d, i){
                // console.log(event)
                tooltip.html(label)
                    .style("visibility", "visible");
                })
                // eslint-disable-next-line @typescript-eslint/ban-ts-comment
                // @ts-ignore
                // eslint-disable-next-line @typescript-eslint/no-unused-vars
                .on("mousemove", function(event, d){
                    tooltip
                    // eslint-disable-next-line @typescript-eslint/ban-ts-comment
                    // @ts-ignore
                    .style("top", d3.event.pageY + this.props.voffset + "px")
                    // eslint-disable-next-line @typescript-eslint/ban-ts-comment
                    // @ts-ignore
                    .style("left", d3.event.pageX + this.props.hoffset + "px");
                }.bind(this))
                // eslint-disable-next-line @typescript-eslint/ban-ts-comment
                // @ts-ignore
                // eslint-disable-next-line @typescript-eslint/no-unused-vars
                .on("mouseout",  function(d, i){
                    tooltip.style("visibility", "hidden")
                })
        }
    useEffect(() => {
        const divElement = elementRef.current
        if (divElement !== null) {
            divElement.id = id
            // eslint-disable-next-line @typescript-eslint/ban-ts-comment
            // @ts-ignore
            mpld3.draw_figure(id, parsedJson)
        }
    }, [])
    return (
        <div ref={elementRef}></div>
    )
 }