/**
 * @license
 * Copyright 2018-2021 Streamlit Inc.
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

import React, { ReactElement, Component, useState, useRef } from "react"
import Webcam from "react-webcam"
import { CameraImageInput as CameraImageInputProto } from "src/autogen/proto"
import { WidgetStateManager } from "src/lib/WidgetStateManager"
import { ReportRunState } from "src/lib/ReportRunState"
import { CameraState } from "src/lib/CameraState"

export interface CameraProps {
  element: CameraImageInputProto
  widgetMgr: WidgetStateManager
  reportRunState: ReportRunState
}

interface CameraState {
  cameraState: CameraState
}

function Camera({ element, widgetMgr, reportRunState }: CameraProps) {
  const webcamRef = useRef<Webcam>(null) as any
  const [imgSrc, setImgSrc] = useState<string | null>(null)
  const [cameraState, setCameraState] = useState<string | null>(
    CameraState.PHOTO_TAKING
  )
  // const isRunning = reportRunState === ReportRunState.RUNNING
  //   console.log(isRunning)
  console.log(element)
  console.log(widgetMgr)
  const capture = React.useCallback(() => {
    const imageSrc = webcamRef.current.getScreenshot()
    widgetMgr.setStringValue(element, imageSrc, { fromUi: true })
    setCameraState(CameraState.PHOTO_TAKEN)
    setImgSrc(imageSrc)
  }, [webcamRef, setImgSrc])

  return (
    <>
      <Webcam audio={false} ref={webcamRef} screenshotFormat="image/jpeg" />
      <button onClick={capture}>Capture photo</button>
      {imgSrc && <img src={imgSrc} />}
    </>
  )
}

export default Camera
