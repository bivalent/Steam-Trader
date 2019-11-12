import React from 'react';
import { Button, Form, FormGroup, Label, Input } from 'reactstrap';
import BuyTradeForm from './BuyTradeForm'
import uuidv4 from 'uuid/v4'

class CreateTradeForm extends React.Component {
  state = {
    trade_id: uuidv4().replace(/-/g, ''),
    steam_id: '',
    app_id: '',
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
        trade_id: this.state.trade_id,
        steam_id: this.state.steam_id,
        app_id: this.state.app_id
        //assetid: this.state.assetid,
        //classid: this.state.classid,
        //instanceid: this.state.instanceid,
        //inventoryContext: this.state.inventoryContext,
        //askingPrice: this.state.askingPrice
      })
    })
      .then(response => response.json())
      .then(trade => {
        if(Array.isArray(trade)) {
          this.props.addTradeToState(trade[0])
          this.props.toggle()
        } else {
          console.log('failure')
        }
      })
      .catch(err => console.log(err))
  }

  submitFormBuy = e => {
    e.preventDefault()
    fetch('http://localhost:3000/crud', {
      method: 'put',
      headers: {
        'Content-Type': 'application/json'
      },
      body: JSON.stringify({
        trade_id: this.state.trade_id,
        buyer_steam_id: this.state.buyer_steam_id
      })
    })
      .then(response => response.json())
      .then(trade => {
        if(Array.isArray(trade)) {
          // console.log(trade[0])
          this.props.updateState(trade[0])
          this.props.toggle()
        } else {
          console.log('failure')
        }
      })
      .catch(err => console.log(err))
  }

  componentDidMount(){
    // if trade exists, populate the state with proper data
    if(this.props.trade){
      const { trade_id, buyer_steam_id, app_id, assetid, classid, instanceid, inventoryContext, askingPrice } = this.props.trade
      this.setState({ trade_id, buyer_steam_id })
    }
  }

  renderCreateForm() {
    return (
      <Form onSubmit={this.submitFormAdd}>
        <FormGroup>
          <Label for="trade_id">Trade Id</Label>
          <Input type="text" name="trade_id" id="trade_id" onChange={this.onChange} value={this.state.trade_id === null ? uuidv4().replace(/-/g, '') : this.state.trade_id} />
        </FormGroup>
        <FormGroup>
          <Label for="steam_id">Steam Id</Label>
          <Input type="text" name="steam_id" id="steam_id" onChange={this.onChange} value={this.state.steam_id}  />
        </FormGroup>
        <FormGroup>
          <Label for="app_id">AppId</Label>
          <Input type="number" name="app_id" id="app_id" onChange={this.onChange} value={this.state.app_id}  />
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

  render() {
    return this.props.trade ? BuyTradeForm.renderBuyForm : this.submitFormAdd
  }
}

export default CreateTradeForm
