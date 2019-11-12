import React, { Component } from 'react'
import { Button, Modal, ModalHeader, ModalBody } from 'reactstrap'
import CreateTradeForm from '../Forms/CreateTradeForm'
import BuyTradeForm from '../Forms/BuyTradeForm'

class ModalForm extends Component {
  constructor(props) {
    super(props)
    this.state = {
      modal: false
    }
  }

  toggle = () => {
    this.setState(prevState => ({
      modal: !prevState.modal
    }))
  }

  render() {
      const closeBtn = <button className="close" onClick={this.toggle}>&times;</button>

      const label = this.props.buttonLabel

      let button = ''
      let title = ''
      button = <Button
                color="success"
                onClick={this.toggle}
                style={{float: "left", marginRight:"10px"}}>{label}
              </Button>
      title = 'Add New Trade'

      return (
      <div>
        {button}
        <Modal isOpen={this.state.modal} toggle={this.toggle} className={this.props.className}>
          <ModalHeader toggle={this.toggle} close={closeBtn}>{title}</ModalHeader>
          <ModalBody>
            <CreateTradeForm
              addTradeToState={this.props.addTradeToState}
              updateState={this.props.updateState}
              toggle={this.toggle}
              trade={this.props.trade} />
          </ModalBody>
        </Modal>
      </div>
    )
  }
}

export default ModalForm
