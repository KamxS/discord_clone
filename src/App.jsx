import { useEffect } from "react";
import { useState } from "react";
import "./App.css";
import Webrtc from "./components/webrtc";
import pb from "./lib/pocketbase";

function App() {
    const [channels, setChannels] = useState([]);

    useEffect(() => {
        async function getChannels() {
            let list = await pb.collection('channel').getFullList(200,{expand: 'users'});
            setChannels(list);
        }
        getChannels();
        pb.collection('channel').subscribe("*", function (channel_event) {
            switch(channel_event.action) {
                case 'create':
                    getChannels();
                    break;
                case 'update':
                    getChannels();
                    break;
                case 'delete':
                    setChannels(channels => [...(channels.filter(channel => {return channel.id !== channel_event.record.id}))]);    
                break;
            }
        });

        return () => {
            pb.collection('channel').unsubscribe();
        }
    }, []); 
    
    async function login(username) {
        if(pb.authStore.isValid) {
            console.log("You're already logged in");
            return;
        }
        const auth = await pb.collection('users').authWithPassword(username,'123456789');
    }

    async function leaveChannel() {
        if(!pb.authStore.isValid) return;

        const user_id = pb.authStore.model.id;
        const user = await pb.collection('users').getOne(user_id);
        if(user.channel_joined === "") return;
        
        const channel_id = user.channel_joined;

        const channel = await pb.collection('channel').getOne(channel_id);
        const leave = await pb.collection('channel').update(channel_id,{users: channel.users.filter(user => user !== pb.authStore.model.id)});
    }

    async function joinChannel(id) {
        if(!pb.authStore.isValid) return;

        await leaveChannel();
        
        const channel = await pb.collection('channel').getOne(id);

        const channel_data = {
            users: [pb.authStore.model.id, ...(channel.users)]
        };
        const user_data = {
            channel_joined: id
        }
        const joinUser = await pb.collection('users').update(pb.authStore.model.id, user_data);
        const join = await pb.collection('channel').update(id,channel_data);
    }

    return <div className="App">
            <Webrtc/>
            {channels.map(channel => {
                return (
                    <>
                    <div onClick={() => joinChannel(channel.id)} className="channel" key={channel.id}>   
                        <p>{channel.name}</p>
                        {channel.expand.users && channel.expand.users.map(user => {
                            return <p>{user.username}</p>
                        })}
                    </div>
                    <br></br>
                    </>
                )
            })}    
            <div onClick={() => login("Test1")}>User 1</div>
            <div onClick={() => login("Test2")}>User 2</div>
            <div onClick={() => pb.authStore.clear()}>Log out</div>
        </div>
}
export default App;
