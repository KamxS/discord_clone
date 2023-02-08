import { useRef, useState } from "react";
import { useEffect } from "react";
import pb from "../lib/pocketbase";

const servers = {
    iceServers: [
        {
            urls: [
                "stun:stun1.l.google.com:19302",
                "stun:stun2.l.google.com:19302",
            ],
        },
    ],
    iceCandidatePoolSize: 10,
};

let pc = new RTCPeerConnection(servers);

let localStream = null;
let remoteStream = null;

const Webrtc = () => {
    const inp = useRef(null);
    const localStreamVideo = useRef(null);
    const remoteStreamVideo = useRef(null);

    useEffect(() => {
        async function getMedia() {
            localStream = await navigator.mediaDevices.getUserMedia({
                audio: true,
            });
            localStream.getTracks().forEach((track) => {
                pc.addTrack(track, localStream);
            });
            remoteStream = new MediaStream();

            pc.ontrack = (event) => {
                event.streams[0].getTracks().forEach((track) => {
                    remoteStream.addTrack(track);
                });
            };

            localStreamVideo.current.srcObject = localStream;
            remoteStreamVideo.current.srcObject = remoteStream;
        }
        getMedia();
    }, []);

    async function createOffer() {
        let call = await pb.collection("calls").create();
        const callID = call.id;
        console.log(callID);

        //Offer creation
        const offer_desc = await pc.createOffer();
        await pc.setLocalDescription(offer_desc);

        pc.onicecandidate = async event => {
            if(event.candidate) await pb.collection('offers').create({offer: event.candidate.toJSON()});
        };

        const offer = {
            sdp: offer_desc.sdp,
            type: offer_desc.type
        };
        await pb.collection("calls").update(callID, { offer });
        
        //listen to remote answers
        pb.collection("calls").subscribe(callID, async function (e) {
            const data = e.record;
            if (!pc.currentRemoteDescription && data?.answer) {
                const remoteDescription = new RTCSessionDescription(data.answer);
                await pc.setRemoteDescription(remoteDescription);
                
                // get answer canidates from DB and assigning them to pc
                pb.collection("answers").subscribe('*',e => {
                    if(e.action !== "create") return;
                    const candidate = new RTCIceCandidate(e.record.answer);
                    pc.addIceCandidate(candidate);
                })
            }
        });
    }

    async function answerOffer(callID) {
        //getting offer call document
        console.log(callID);
        let callDoc = await pb.collection("calls").getOne(callID);

        //adding our answering end ice candidates to the server
        pc.onicecandidate = async event => {
            if(event.candidate) await pb.collection('answers').create({answer: event.candidate.toJSON()});
        } 

        const offer_desc = callDoc.offer;
        await pc.setRemoteDescription(new RTCSessionDescription(offer_desc));

        const answer_desc = await pc.createAnswer();
        await pc.setLocalDescription(answer_desc);
        
        const answer = {
            sdp: answer_desc.sdp,
            type: answer_desc.type
        };
        await pb.collection("calls").update(callID, { answer });
        
        // get answer canidates from DB and assigning them to pc
        pb.collection("offers").subscribe('*',e => {
            if(e.action !== "create") return;
            const candidate = new RTCIceCandidate(e.record.offer);
            pc.addIceCandidate(new RTCIceCandidate(candidate));
        })
    }

    return (
        <div>
            <video ref={localStreamVideo} autoPlay playsInline></video>
            <video ref={remoteStreamVideo} autoPlay playsInline></video>
            <div onClick={() => createOffer()}>Create Call</div>
            <input ref={inp} type="text"></input>
            <div onClick={() => answerOffer(inp.current.value)}>Answer Call</div>
        </div>
    );
};

export default Webrtc;
