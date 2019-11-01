import React from 'react';
import { Button, Form, FormGroup, Label, Input } from 'reactstrap';
import uuidv4 from 'uuid/v4'

class AddEditForm extends React.Component {
  state = {
    trade_id: uuidv4().replace(/-/g, ''),
    steam_id: '',
    appid: '',
    assetid: 0,
    classid: 0,
    instanceid: 0,
    inventoryContext: 0,
    askingPrice: 0
  }

  onChange = e => {
    this.setState({[e.target.name]: e.target.value})
  }

  submitFormAdd = e => {
    e.preventDefault()
    fetch('http://localhost:3000/crud', {
      method: 'post',
      headers: {
        'Content-Type': 'application/json'
      },

      body: JSON.stringify({
        trade_id: uuidv4().replace(/-/g, ''),
        steam_id: this.state.steam_id,
        appid: this.state.appid,
        assetid: this.state.assetid,
        classid: this.state.classid,
        instanceid: this.state.instanceid,
        inventoryContext: this.state.inventoryContext,
        askingPrice: this.state.askingPrice
      })
    })
      .then(response => response.json())
      .then(item => {
        if(Array.isArray(item)) {
          this.props.addItemToState(item[0])
          this.props.toggle()
        } else {
          console.log('failure')
        }
      })
      .catch(err => console.log(err))
  }

  submitFormEdit = e => {
    e.preventDefault()
    fetch('http://localhost:3000/crud', {
      method: 'put',
      headers: {
        'Content-Type': 'application/json'
      },
      body: JSON.stringify({
        trade_id: this.state.trade_id,
        steam_id: this.state.steam_id,
        appid: this.state.appid,
        assetid: this.state.assetid,
        classid: this.state.classid,
        instanceid: this.state.instanceid,
        inventoryContext: this.state.inventoryContext,
        askingPrice: this.state.askingPrice
      })
    })
      .then(response => response.json())
      .then(item => {
        if(Array.isArray(item)) {
          // console.log(item[0])
          this.props.updateState(item[0])
          this.props.toggle()
        } else {
          console.log('failure')
        }
      })
      .catch(err => console.log(err))
  }

  componentDidMount(){
    // if item exists, populate the state with proper data
    if(this.props.item){
      const { trade_id, steam_id, appid, assetid, classid, instanceid, inventoryContext, askingPrice } = this.props.item
      this.setState({ trade_id, steam_id, appid, assetid, classid, instanceid, inventoryContext, askingPrice })
    }
  }

  render() {
    return (
      <Form onSubmit={this.props.item ? this.submitFormEdit : this.submitFormAdd}>
        <FormGroup>
          <Label for="trade_id">Trade Id</Label>
          <Input type="text" name="trade_id" id="trade_id" onChange={this.onChange} value={this.state.trade_id === null ? uuidv4().replace(/-/g, '') : this.state.trade_id} />
        </FormGroup>
        <FormGroup>
          <Label for="steam_id">Steam Id</Label>
          <Input type="text" name="steam_id" id="steam_id" onChange={this.onChange} value={this.state.steam_id}  />
        </FormGroup>
        <FormGroup>
          <Label for="appId">AppId</Label>
          <Input type="number" name="appId" id="appId" onChange={this.onChange} value={this.state.appId}  />
        </FormGroup>
        <FormGroup>
          <Label for="assetid">AssetId</Label>
          <Input type="number" name="assetid" id="assetid" onChange={this.onChange} value={this.state.assetid} />
        </FormGroup>
        <FormGroup>
          <Label for="classid">ClassId</Label>
          <Input type="number" name="classid" id="classid" onChange={this.onChange} value={this.state.classid} />
        </FormGroup>
        <FormGroup>
          <Label for="instanceid">InstanceId</Label>
          <Input type="number" name="instanceid" id="instanceid" onChange={this.onChange} value={this.state.instanceid}  />
        </FormGroup>
        <FormGroup>
          <Label for="inventoryContext">InventoryContext</Label>
          <Input type="number" name="inventoryContext" id="inventoryContext" onChange={this.onChange} value={this.state.inventoryContext}  />
        </FormGroup>
        <FormGroup>
          <Label for="askingPrice">AskingPrice</Label>
          <Input type="number" name="askingPrice" id="askingPrice" onChange={this.onChange} value={this.state.askingPrice}  />
        </FormGroup>
        <Button>Submit</Button>
      </Form>
    );
  }
}

export default AddEditForm
